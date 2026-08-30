import { z } from "zod";

export const mediaTaskSchema = z.enum(["image", "video"]);
export const mediaJobStatusSchema = z.enum(["queued", "processing", "completed", "failed"]);

export const mediaJobResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  contentId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  task: mediaTaskSchema,
  prompt: z.string(),
  inputUrl: z.string().nullable(),
  format: z.enum(["vertical", "horizontal"]).nullable(),
  outputIndex: z.string().nullable(),
  providerTaskId: z.string().nullable(),
  status: mediaJobStatusSchema,
  outputUrl: z.string().nullable(),
  error: z.string().nullable(),
  attempts: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mediaJobIdParamsSchema = z.object({ id: z.string().min(1) });
export const mediaContentParamsSchema = z.object({ contentId: z.string().min(1) });
export const createMediaJobSchema = z.object({
  companyId: z.string().min(1),
  contentId: z.string().min(1).nullable().optional(),
  task: mediaTaskSchema,
  prompt: z.string().min(1).max(12000),
  inputUrl: z.url().max(2048).nullable().optional(),
  outputIndex: z.number().int().min(0).nullable().optional(),
  format: z.enum(["vertical", "horizontal"]).nullable().optional(),
  configId: z.string().min(1).nullable().optional(),
});

export const mediaErrorResponseSchema = z.object({ error: z.string() });
