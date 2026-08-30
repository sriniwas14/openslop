import { z } from "zod";
import { AI_PROVIDERS } from "../../lib/mastra";

const aiConfigFields = {
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  serviceAccountJson: z.string().max(20000).optional().or(z.literal("")),
  baseUrl: z.string().max(2048).optional().or(z.literal("")),
  projectId: z.string().max(255).optional().or(z.literal("")),
  location: z.string().max(255).optional().or(z.literal("")),
  model: z.string().max(255).optional().or(z.literal("")),
  name: z.string().max(255).optional().or(z.literal("")),
  isDefault: z.boolean().optional(),
};

function requireVertexSettings(value: { provider?: string; projectId?: string; location?: string }, ctx: z.RefinementCtx) {
  if (value.provider === "vertex") {
    if (!value.projectId?.trim()) ctx.addIssue({ code: "custom", path: ["projectId"], message: "projectId is required for Google Vertex AI" });
    if (!value.location?.trim()) ctx.addIssue({ code: "custom", path: ["location"], message: "location is required for Google Vertex AI" });
  }
}

export const createAiConfigSchema = z.object(aiConfigFields).superRefine(requireVertexSettings);

// PATCH may update an unrelated field on an existing Vertex config. Validate
// the pair when either Vertex field is explicitly changed.
export const updateAiConfigSchema = z.object(aiConfigFields).partial().superRefine((value, ctx) => {
  if (value.provider === "vertex" && (value.projectId !== undefined || value.location !== undefined)) {
    requireVertexSettings(value, ctx);
  }
});

export const aiConfigIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const aiConfigResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.string(),
  apiKeyMasked: z.string().nullable(),
  serviceAccountConfigured: z.boolean(),
  baseUrl: z.string().nullable(),
  projectId: z.string().nullable(),
  location: z.string().nullable(),
  model: z.string().nullable(),
  name: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const modelQuerySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  task: z.enum(["video", "image", "text"]).optional(),
  configId: z.string().optional(),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().max(2048).optional().or(z.literal("")),
  q: z.string().max(255).optional(),
});

export const CONTENT_KINDS = ["carousel", "talking-head", "short-video", "image", "text", "article"] as const;

export const generateContentBodySchema = z.object({
  type: z.enum(CONTENT_KINDS),
  companyId: z.string().min(1),
});

export const generatedContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  platforms: z.array(z.string()),
  aiScore: z.number().int().min(0).max(100),
});

export const errorResponseSchema = z.object({ error: z.string() });

export const preferencesSchema = z.object({
  videoConfigId: z.string().nullable(),
  videoModel: z.string().nullable(),
  imageConfigId: z.string().nullable(),
  imageModel: z.string().nullable(),
  textConfigId: z.string().nullable(),
  textModel: z.string().nullable(),
});

export const updatePreferencesSchema = z.object({
  videoConfigId: z.string().min(1).nullable().optional(),
  videoModel: z.string().max(255).nullable().optional().or(z.literal("")),
  imageConfigId: z.string().min(1).nullable().optional(),
  imageModel: z.string().max(255).nullable().optional().or(z.literal("")),
  textConfigId: z.string().min(1).nullable().optional(),
  textModel: z.string().max(255).nullable().optional().or(z.literal("")),
});

export const onboardingProgressSchema = z.object({
  step: z.enum(["1", "2", "3"]).or(z.number().int().min(1).max(3)),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const onboardingProgressResponseSchema = z.object({
  step: z.string(),
  data: z.string().nullable(),
  updatedAt: z.string(),
});
