import { z } from "zod";

export const memeIdParamsSchema = z.object({
  id: z.string().min(1).max(120),
});

export const memeResponseSchema = z.object({
  id: z.string(),
  description: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createMemeBodySchema = z.object({
  id: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes only"),
  description: z.string().min(1).max(2000),
  url: z.url().max(2000),
});

export const updateMemeBodySchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  url: z.url().max(2000).optional(),
});

export function mapMemeRow(row: {
  id: string;
  description: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: row.id,
    description: row.description,
    url: row.url,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
