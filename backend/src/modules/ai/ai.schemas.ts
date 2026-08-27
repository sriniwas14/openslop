import { z } from "zod";
import { AI_PROVIDERS } from "../../lib/mastra";

export const createAiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().max(2048).optional().or(z.literal("")),
  model: z.string().max(255).optional().or(z.literal("")),
  name: z.string().max(255).optional().or(z.literal("")),
  isDefault: z.boolean().optional(),
});

export const updateAiConfigSchema = createAiConfigSchema.partial();

export const aiConfigIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const aiConfigResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.string(),
  apiKeyMasked: z.string().nullable(),
  baseUrl: z.string().nullable(),
  model: z.string().nullable(),
  name: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const modelQuerySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  configId: z.string().optional(),
  apiKey: z.string().max(2048).optional().or(z.literal("")),
  baseUrl: z.string().max(2048).optional().or(z.literal("")),
  q: z.string().max(255).optional(),
});

export const errorResponseSchema = z.object({ error: z.string() });
