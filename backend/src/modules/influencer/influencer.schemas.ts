import { z } from "zod";

export const influencerAttributesSchema = z.object({
  gender: z.string().max(50).optional(),
  ageRange: z.string().max(50).optional(),
  ethnicity: z.string().max(100).optional(),
  hairStyle: z.string().max(100).optional(),
  eyeColor: z.string().max(50).optional(),
  clothing: z.string().max(100).optional(),
  background: z.string().max(100).optional(),
  vibe: z.string().max(100).optional(),
  pose: z.string().max(100).optional(),
});

export const influencerResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  name: z.string(),
  imageUrl: z.string(),
  prompt: z.string().nullable(),
  attributes: z.unknown().nullable(),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createInfluencerSchema = z.object({
  name: z.string().min(1).max(100),
  imageData: z.string().max(15_000_000).optional(), // data URI base64
  imageUrl: z.string().max(2048).optional(),
  attributes: influencerAttributesSchema.optional(),
  prompt: z.string().max(5000).optional(),
  source: z.enum(["upload", "generated"]).optional(),
}).refine((v) => !!v.imageData || !!v.imageUrl, { message: "imageData or imageUrl required", path: ["imageData"] });

export const previewInfluencerSchema = z.object({
  attributes: influencerAttributesSchema.optional().default({}),
  prompt: z.string().max(5000).optional(),
  name: z.string().max(100).optional(),
});

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });
export const influencerIdParamsSchema = z.object({ id: z.string().min(1) });
export const errorResponseSchema = z.object({ error: z.string() });
export const previewResponseSchema = z.object({ previewUrl: z.string(), prompt: z.string() });
