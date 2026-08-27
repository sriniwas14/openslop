import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  website: z.url().max(2048),
  persona: z.string().max(10_000).nullish(),
});

export const updateCompanySchema = createCompanySchema.partial();

export const companyIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const companyResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  website: z.string(),
  persona: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});
