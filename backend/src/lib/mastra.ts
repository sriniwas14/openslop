import { createOpenAI } from "@ai-sdk/openai";
import { createOllama } from "ollama-ai-provider-v2";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";

export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "runway",
  "vertex",
  "fal",
  "luma",
  "ollama",
  "custom",
] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DISCOVERY_ONLY_PROVIDERS = new Set<AiProvider>(["runway", "vertex", "fal", "luma"]);

// mastra's built-in model router reads these itself; a missing key surfaces as a
// clear runtime error naming the var when you actually generate:
//   openai: OPENAI_API_KEY · anthropic: ANTHROPIC_API_KEY · google: GOOGLE_GENERATIVE_AI_API_KEY
//   xai: XAI_API_KEY · openrouter: OPENROUTER_API_KEY

const ROUTER_PROVIDERS = new Set<AiProvider>([
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
]);

export function resolveModel(provider: AiProvider, model: string) {
  if (DISCOVERY_ONLY_PROVIDERS.has(provider)) {
    throw new Error(`${provider} is configured for model discovery only; media generation adapters are not enabled yet`);
  }
  if (ROUTER_PROVIDERS.has(provider)) {
    return `${provider}/${model}`;
  }
  if (provider === "ollama") {
    const base = process.env.OLLAMA_BASE_URL;
    const ollama = createOllama(base ? { baseURL: base } : undefined);
    return ollama(model);
  }
  // ponytail: custom = any OpenAI-compatible endpoint (vLLM, LiteLLM, gateways)
  return createOpenAI({
    apiKey: process.env.CUSTOM_LLM_API_KEY ?? "not-set",
    baseURL: process.env.CUSTOM_LLM_BASE_URL || "http://localhost:4000/v1",
  })(model);
}

const ASSISTANT_INSTRUCTIONS = "You are a helpful assistant.";

const agentCache = new Map<string, Agent>();

export function getAgent(options: {
  provider?: AiProvider;
  model: string;
  instructions?: string;
}): Agent {
  const provider = options.provider ?? "openai";
  const key = `${provider}|${options.model}|${options.instructions ?? ""}`;
  let agent = agentCache.get(key);
  if (!agent) {
    agent = new Agent({
      id: key.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63),
      name: key,
      instructions: options.instructions ?? ASSISTANT_INSTRUCTIONS,
      model: resolveModel(provider, options.model),
    });
    agentCache.set(key, agent);
  }
  return agent;
}

export const mastra = new Mastra({
  agents: {
    assistant: getAgent({ provider: "openai", model: "gpt-4o-mini" }),
  },
});
