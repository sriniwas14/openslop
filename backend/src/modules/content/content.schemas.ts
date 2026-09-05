import { z } from "zod";

export const contentKinds = ["carousel", "talkinghead", "greenscreen"] as const;
export const videoKinds = ["talkinghead", "greenscreen"] as const;

export const carouselImageSchema = z.object({
  url: z.url().max(2048),
  text: z.string().min(1).max(2000),
  font: z.string().max(100).optional(),
  background: z.string().max(100).optional(),
  color: z.string().max(100).optional(),
});

export const scriptSchema = z.object({
  type: z.enum(["aroll", "broll"]),
  prompt: z.string().min(1).max(5000),
});

const baseContentFields = {
  companyId: z.string().min(1),
  kind: z.enum(contentKinds),
  title: z.string().min(1).max(255),
  status: z.enum(["draft", "published"]).default("draft").optional(),
  images: z.array(carouselImageSchema).max(20).optional(),
  scripts: z.array(scriptSchema).max(50).optional(),
  format: z.enum(["vertical", "horizontal"]).optional(),
  duration: z.number().int().refine((v) => [15, 30, 45].includes(v), { message: "duration must be 15, 30 or 45" }).optional(),
  influencerId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
};

export const createContentSchema = z.object(baseContentFields).superRefine((v, ctx) => {
  if (v.kind === "carousel") {
    if (!v.images || v.images.length === 0) {
      ctx.addIssue({ code: "custom", path: ["images"], message: "images required for carousel" });
    }
    if (v.scripts) ctx.addIssue({ code: "custom", path: ["scripts"], message: "scripts not allowed for carousel" });
    if (v.format) ctx.addIssue({ code: "custom", path: ["format"], message: "format not allowed for carousel" });
    if (v.duration) ctx.addIssue({ code: "custom", path: ["duration"], message: "duration not allowed for carousel" });
    if (v.influencerId) ctx.addIssue({ code: "custom", path: ["influencerId"], message: "influencer not allowed for carousel" });
  }
  if ((videoKinds as readonly string[]).includes(v.kind)) {
    if (!v.scripts || v.scripts.length === 0) {
      ctx.addIssue({ code: "custom", path: ["scripts"], message: "scripts required for talkinghead/greenscreen" });
    }
    if (!v.format) {
      ctx.addIssue({ code: "custom", path: ["format"], message: "format required for talkinghead/greenscreen" });
    }
    if (!v.duration) {
      ctx.addIssue({ code: "custom", path: ["duration"], message: "duration required for video types" });
    }
    if (v.images) ctx.addIssue({ code: "custom", path: ["images"], message: "images not allowed for video types" });
    if (v.kind === "talkinghead" && !v.influencerId) {
      ctx.addIssue({ code: "custom", path: ["influencerId"], message: "influencer required for talkinghead" });
    }
  }
});

// ponytail: update is partial without cross-field refine — merged validation happens where kind is known
export const updateContentSchema = z
  .object(baseContentFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty patch" });

export const contentIdParamsSchema = z.object({ id: z.string().min(1) });

export const contentResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  companyId: z.string(),
  kind: z.enum(contentKinds),
  title: z.string(),
  status: z.string(),
  images: z.array(carouselImageSchema).nullable(),
  scripts: z.array(scriptSchema).nullable(),
  mediaUrl: z.string().nullable(),
  format: z.enum(["vertical", "horizontal"]).nullable(),
  duration: z.number().int().nullable(),
  influencerId: z.string().nullable(),
  templateId: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const errorResponseSchema = z.object({ error: z.string() });

export const companyIdParamsSchema = z.object({ companyId: z.string().min(1) });

export const contentListQuerySchema = z.object({
  kind: z.enum(contentKinds).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

// ideas — transient, no DB table (ponytail: persist when history/analytics needed)
export const ideaSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(120),
  painPoint: z.string().min(1).max(500),
  hooks: z.array(z.string().min(1).max(280)).min(2).max(5),
  angle: z.string().max(500).optional(),
});

export const ideasBodySchema = z.object({
  kind: z.enum(contentKinds).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

export const ideasResponseSchema = z.object({
  ideas: z.array(ideaSchema),
});

export const generateFromIdeaSchema = z.object({
  ideaId: z.string().optional(),
  idea: ideaSchema.optional(),
  selectedHook: z.string().min(1).max(280),
  kind: z.enum(contentKinds).optional(),
  title: z.string().min(1).max(255).optional(),
  duration: z.number().int().refine((v) => [15, 30, 45].includes(v), { message: "duration must be 15, 30 or 45" }).optional(),
  influencerId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
}).refine((v) => !!v.idea || !!v.ideaId, { message: "idea or ideaId required" });

// ponytail: helpers — sqlite stores JSON as text; parse on read, stringify on write
export function parseContentRow(row: {
  images: string | null;
  scripts: string | null;
  format: string | null;
  duration: string | number | null;
  influencerId?: string | null;
  templateId?: string | null;
  scheduledAt: string | null;
  [k: string]: unknown;
}) {
  const d = row.duration;
  const duration = d == null ? null : typeof d === "number" ? d : Number(d);
  return {
    ...row,
    images: row.images ? (JSON.parse(row.images) as z.infer<typeof carouselImageSchema>[]) : null,
    scripts: row.scripts ? (JSON.parse(row.scripts) as z.infer<typeof scriptSchema>[]) : null,
    mediaUrl: (row.mediaUrl as string | null) ?? null,
    format: row.format as "vertical" | "horizontal" | null,
    duration: Number.isFinite(duration as number) ? (duration as number) : null,
    influencerId: (row.influencerId as string | null) ?? (row as any).influencer_id ?? null,
    templateId: (row.templateId as string | null) ?? (row as any).template_id ?? null,
    scheduledAt: (row.scheduledAt as string | null) ?? null,
  };
}

export function serializeContentInput(input: z.infer<typeof createContentSchema>) {
  return {
    ...input,
    status: input.status ?? "draft",
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
    duration: (input as any).duration ?? null,
    influencerId: (input as any).influencerId ?? null,
    templateId: (input as any).templateId ?? null,
    images: input.images ? JSON.stringify(input.images) : null,
    scripts: input.scripts ? JSON.stringify(input.scripts) : null,
  };
}
