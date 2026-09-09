import { z } from "zod";

// ponytail: Library snapshots — overlay layers are opaque to the backend (the feed's
// editor owns their shape); validate as passthrough JSON and store as TEXT.
const blocksSchema = z.array(z.any()).default([]);
const gifLayerSchema = z.any().nullable().optional();
const aspectSchema = z.number().positive().max(10).nullable().optional();

export const libraryStatuses = ["draft", "scheduled", "published"] as const;

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });
export const libraryPostIdParamsSchema = z.object({ companyId: z.string().min(1), id: z.string().min(1) });

export const createLibraryPostSchema = z.object({
  contentId: z.string().min(1),
  title: z.string().max(500).nullable().optional(),
  hook: z.string().max(2000).nullable().optional(),
  body: z.string().max(10000).nullable().optional(),
  platform: z.string().max(50).default("instagram"),
  contentFormat: z.string().max(100).default(""),
  contentType: z.string().max(100).default(""),
  visualUrl: z.string().max(2048).nullable().optional(),
  mediaType: z.enum(["image", "video"]).default("image"),
  posterUrl: z.string().max(2048).nullable().optional(),
  blocks: blocksSchema,
  gifLayer: gifLayerSchema,
  memeUrl: z.string().max(2048).nullable().optional(),
  aspect: aspectSchema,
  needsAttention: z.boolean().default(false),
  // data: URL (data:image/... or data:video/...) for an Edit-replaced visual;
  // written to data/media and served via /media/files. Null/absent = keep remote visual.
  editedFileDataUrl: z.string().max(15 * 1024 * 1024).nullable().optional(),
  editedMediaType: z.enum(["image", "video"]).nullable().optional(),
});

export const updateLibraryPostSchema = z
  .object({
    title: z.string().max(500).nullable().optional(),
    hook: z.string().max(2000).nullable().optional(),
    body: z.string().max(10000).nullable().optional(),
    platform: z.string().max(50).optional(),
    contentFormat: z.string().max(100).optional(),
    contentType: z.string().max(100).optional(),
    visualUrl: z.string().max(2048).nullable().optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    posterUrl: z.string().max(2048).nullable().optional(),
    blocks: z.array(z.any()).optional(),
    gifLayer: z.any().nullable().optional(),
    memeUrl: z.string().max(2048).nullable().optional(),
    aspect: z.number().positive().max(10).nullable().optional(),
    needsAttention: z.boolean().optional(),
    status: z.enum(libraryStatuses).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    // string = replace, null = clear back to remote visual, undefined = keep
    editedFileDataUrl: z.string().max(15 * 1024 * 1024).nullable().optional(),
    editedMediaType: z.enum(["image", "video"]).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty patch" });

export const libraryPostListQuerySchema = z.object({
  status: z.enum(libraryStatuses).optional(),
  attention: z.enum(["true", "false"]).optional(),
  contentId: z.string().min(1).optional(),
});

export const libraryPostCheckQuerySchema = z.object({ contentId: z.string().min(1) });

export const libraryPostResponseSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  contentId: z.string(),
  title: z.string().nullable(),
  hook: z.string().nullable(),
  body: z.string().nullable(),
  platform: z.string(),
  contentFormat: z.string(),
  contentType: z.string(),
  visualUrl: z.string().nullable(),
  mediaType: z.enum(["image", "video"]),
  posterUrl: z.string().nullable(),
  blocks: z.array(z.any()),
  gifLayer: z.any().nullable(),
  memeUrl: z.string().nullable(),
  aspect: z.number().nullable(),
  editedFile: z.string().nullable(),
  editedMediaType: z.enum(["image", "video"]).nullable(),
  needsAttention: z.boolean(),
  status: z.string(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const libraryPostCheckResponseSchema = z.object({ saved: z.boolean() });

export const createLibraryMediaSchema = z.object({
  name: z.string().min(1).max(255),
  mediaType: z.enum(["image", "video"]).default("image"),
  fileDataUrl: z.string().min(1).max(15 * 1024 * 1024),
  blocks: blocksSchema,
  gifLayer: gifLayerSchema,
  memeUrl: z.string().max(2048).nullable().optional(),
  aspect: aspectSchema,
});

export const updateLibraryMediaSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    blocks: z.array(z.any()).optional(),
    gifLayer: z.any().nullable().optional(),
    memeUrl: z.string().max(2048).nullable().optional(),
    aspect: z.number().positive().max(10).nullable().optional(),
    status: z.enum(libraryStatuses).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    fileDataUrl: z.string().max(15 * 1024 * 1024).nullable().optional(),
    mediaType: z.enum(["image", "video"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty patch" });

export const libraryMediaListQuerySchema = z.object({
  status: z.enum(libraryStatuses).optional(),
});

export const libraryMediaResponseSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  name: z.string(),
  mediaType: z.enum(["image", "video"]),
  fileUrl: z.string().nullable(),
  size: z.number(),
  blocks: z.array(z.any()),
  gifLayer: z.any().nullable(),
  memeUrl: z.string().nullable(),
  aspect: z.number().nullable(),
  status: z.string(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const errorResponseSchema = z.object({ error: z.string() });

// ponytail: helpers — sqlite stores JSON/numbers/booleans as text; parse on read
function parseJsonArray(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseJsonNullable(raw: string | null | undefined): any | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseAspect(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseLibraryPostRow(row: Record<string, any>) {
  return {
    id: row.id,
    companyId: row.companyId ?? row.company_id,
    contentId: row.contentId ?? row.content_id,
    title: row.title ?? null,
    hook: row.hook ?? null,
    body: row.body ?? null,
    platform: row.platform ?? "instagram",
    contentFormat: row.contentFormat ?? row.content_format ?? "",
    contentType: row.contentType ?? row.content_type ?? "",
    visualUrl: row.visualUrl ?? row.visual_url ?? null,
    mediaType: (row.mediaType ?? row.media_type ?? "image") === "video" ? ("video" as const) : ("image" as const),
    posterUrl: row.posterUrl ?? row.poster_url ?? null,
    blocks: parseJsonArray(row.blocks),
    gifLayer: parseJsonNullable(row.gifLayer ?? row.gif_layer),
    memeUrl: row.memeUrl ?? row.meme_url ?? null,
    aspect: parseAspect(row.aspect),
    editedFile: row.editedFile ?? row.edited_file ?? null,
    editedMediaType:
      (row.editedMediaType ?? row.edited_media_type) === "video"
        ? ("video" as const)
        : (row.editedMediaType ?? row.edited_media_type) === "image"
          ? ("image" as const)
          : null,
    needsAttention: (row.needsAttention ?? row.needs_attention ?? "0") === "1" || (row.needsAttention ?? row.needs_attention) === true,
    status: row.status ?? "draft",
    scheduledAt: row.scheduledAt ?? row.scheduled_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}

export function parseLibraryMediaRow(row: Record<string, any>) {
  const sizeRaw = row.size ?? "0";
  const size = typeof sizeRaw === "number" ? sizeRaw : Number(sizeRaw);
  return {
    id: row.id,
    companyId: row.companyId ?? row.company_id,
    name: row.name,
    mediaType: (row.mediaType ?? row.media_type ?? "image") === "video" ? ("video" as const) : ("image" as const),
    fileUrl: row.fileUrl ?? row.file_url ?? null,
    size: Number.isFinite(size) ? size : 0,
    blocks: parseJsonArray(row.blocks),
    gifLayer: parseJsonNullable(row.gifLayer ?? row.gif_layer),
    memeUrl: row.memeUrl ?? row.meme_url ?? null,
    aspect: parseAspect(row.aspect),
    status: row.status ?? "draft",
    scheduledAt: row.scheduledAt ?? row.scheduled_at ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
}
