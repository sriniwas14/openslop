import { z } from "zod";

export const contentTemplateResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  previewImage: z.string(),
  duration: z.enum(["15", "30", "45"]),
  structure: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function mapTemplateRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    previewImage: row.previewImage ?? row.preview_image,
    duration: String(row.duration ?? row.duration_text ?? "15"),
    structure: row.structure ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}
