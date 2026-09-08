import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { Agent } from "@mastra/core/agent";
import { resolveUserModel } from "../company/company.workflow";
import { BRAND_INTELLIGENCE_SYSTEM_PROMPT, buildBrandIntelligenceUserPrompt } from "./brand.prompts";
import { extractJson, normalizeAiOutput, saveAnalysis } from "./brand.service";

const workflowInput = z.object({
  companyId: z.string().min(1),
  userId: z.string().min(1),
  name: z.string(),
  website: z.string().min(1),
  extra: z.string().nullish(),
});

const fetchStep = createStep({
  id: "fetch-brand-website",
  inputSchema: workflowInput,
  outputSchema: workflowInput.extend({ content: z.string() }),
  execute: async ({ inputData }) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(inputData.website, {
        signal: controller.signal,
        headers: { "User-Agent": "openslop/1.0 (+brand-intelligence)" },
      });
      if (!res.ok) throw new Error(`Could not fetch website (${res.status} ${res.statusText})`);
      const html = await res.text();
      // ponytail: regex strip, same approach as company.workflow (no cheerio until proven insufficient)
      const content = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 12000);
      if (!content) throw new Error("Website returned no readable content");
      return { ...inputData, content };
    } catch (e: any) {
      if (e?.name === "AbortError") throw new Error("Timed out fetching the brand website");
      throw e;
    } finally {
      clearTimeout(tid);
    }
  },
});

const analyzeStep = createStep({
  id: "analyze-brand-intelligence",
  inputSchema: workflowInput.extend({ content: z.string() }),
  outputSchema: z.object({ text: z.string(), companyId: z.string(), userId: z.string() }),
  execute: async ({ inputData }) => {
    const model = await resolveUserModel(inputData.userId, "text");
    const agent = new Agent({
      id: "brand-intelligence-agent",
      name: "brand-intelligence-agent",
      instructions: BRAND_INTELLIGENCE_SYSTEM_PROMPT,
      model: model as any,
    });
    const res = await agent.generate(
      buildBrandIntelligenceUserPrompt({
        name: inputData.name,
        website: inputData.website,
        content: inputData.content,
        extra: inputData.extra ?? null,
      }),
    );
    if (!res?.text) throw new Error("AI returned an empty response");
    return { text: res.text, companyId: inputData.companyId, userId: inputData.userId };
  },
});

// ponytail: persist inside the workflow (mirrors company.workflow) so the route can
// re-read the DB after streaming without depending on the Mastra stream-result shape.
// Validation happens here — malformed/empty AI output throws and nothing is saved.
const persistStep = createStep({
  id: "persist-brand-intelligence",
  inputSchema: z.object({ text: z.string(), companyId: z.string(), userId: z.string() }),
  outputSchema: z.object({ success: z.boolean(), companyId: z.string() }),
  execute: async ({ inputData }) => {
    const normalized = normalizeAiOutput(extractJson(inputData.text));
    await saveAnalysis(inputData.userId, inputData.companyId, normalized);
    return { success: true, companyId: inputData.companyId };
  },
});

export const brandIntelligenceWorkflow = createWorkflow({
  id: "brand-intelligence-workflow",
  inputSchema: workflowInput,
  outputSchema: z.object({ success: z.boolean(), companyId: z.string() }),
  retryConfig: { attempts: 0 },
})
  .then(fetchStep)
  .then(analyzeStep)
  .then(persistStep)
  .commit();
