import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { aiConfigs, aiPreferences, contents, mediaJobs } from "../../db/schema";
import { pollMedia, startMedia, type MediaInput, type MediaStatus, type MediaTask } from "./media.providers";

type MediaFormat = "vertical" | "horizontal" | null | undefined;

function taskConfigId(preferences: any, task: MediaTask) {
  return task === "image" ? preferences?.imageConfigId : preferences?.videoConfigId;
}

function taskModel(preferences: any, task: MediaTask) {
  return task === "image" ? preferences?.imageModel : preferences?.videoModel;
}

export async function getMediaConfig(userId: string, task: MediaTask, configId?: string | null) {
  const [preferences] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, userId));
  const selectedId = configId ?? taskConfigId(preferences, task);
  const model = taskModel(preferences, task);
  if (!selectedId || !model) throw new Error(`Configure ${task} provider + model in Settings → AI Providers (both required)`);
  const [config] = await db.select().from(aiConfigs).where(and(eq(aiConfigs.id, selectedId), eq(aiConfigs.userId, userId)));
  if (!config) throw new Error(`${task} AI provider configuration was not found`);
  return { config, model: String(model) };
}

function inputForJob(job: any, config: any): MediaInput {
  return {
    provider: config.provider,
    model: job.model,
    apiKey: config.apiKey,
    accessKey: (config as any).accessKey,
    secretKey: (config as any).secretKey,
    serviceAccountJson: config.serviceAccountJson,
    projectId: config.projectId,
    location: config.location,
    baseUrl: config.baseUrl,
    task: job.task,
    prompt: job.prompt,
    inputUrl: job.inputUrl,
    format: job.format ?? null,
    configId: (config as any).configId ?? (job as any).routerConfigId ?? null,
    // ponytail: chunked renderer concatenates N×5s clips — single source of the "5"
    durationSeconds: job.task === "video" ? 5 : null,
  };
}

async function loadJobConfig(job: any) {
  const [config] = await db.select().from(aiConfigs).where(and(eq(aiConfigs.id, job.configId), eq(aiConfigs.userId, job.userId)));
  if (!config) throw new Error("AI provider configuration was deleted");
  return config;
}

async function updateJob(id: string, patch: Record<string, unknown>) {
  const [row] = await db.update(mediaJobs).set({ ...patch, updatedAt: new Date().toISOString() } as any).where(eq(mediaJobs.id, id)).returning();
  return row;
}

async function attachOutput(job: any, outputUrl: string) {
  if (!job.contentId) return;
  const [content] = await db.select().from(contents).where(and(eq(contents.id, job.contentId), eq(contents.userId, job.userId)));
  if (!content) return;
  if (job.task === "video") {
    await db.update(contents).set({ mediaUrl: outputUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, content.id));
    return;
  }
  const images: any[] = content.images ? JSON.parse(content.images) : [];
  const index = Number(job.outputIndex);
  if (!Number.isInteger(index) || !images[index]) return;
  images[index] = { ...images[index], url: outputUrl };
  await db.update(contents).set({ images: JSON.stringify(images), mediaUrl: index === 0 ? outputUrl : content.mediaUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, content.id));
}

export async function submitMediaJob(jobId: string) {
  const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId));
  if (!job || job.status === "completed" || job.status === "failed") return job;
  // ponytail: slow sync providers (OpenRouter /images) keep status "queued" while in
  // flight — without this guard the 10s worker re-submits and double-bills
  if (inFlightSubmissions.has(jobId)) return job;
  inFlightSubmissions.add(jobId);
  try {
    const config = await loadJobConfig(job);
    const result = await startMedia(inputForJob(job, config));
    const updated = await updateJob(job.id, {
      status: result.status,
      providerTaskId: result.providerTaskId ?? null,
      outputUrl: result.outputUrl ?? null,
      error: null,
      attempts: String(Number(job.attempts ?? 0) + 1),
    });
    if (result.status === "completed" && result.outputUrl) await attachOutput(updated, result.outputUrl);
    return updated;
  } catch (error: any) {
    return updateJob(job.id, {
      status: "failed",
      error: String(error?.message ?? "media submission failed").slice(0, 2000),
      attempts: String(Number(job.attempts ?? 0) + 1),
    });
  } finally {
    inFlightSubmissions.delete(jobId);
  }
}

export async function pollMediaJob(jobId: string) {
  const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId));
  if (!job || job.status !== "processing" || !job.providerTaskId) return job;
  try {
    const config = await loadJobConfig(job);
    const result = await pollMedia(inputForJob(job, config), job.providerTaskId);
    const updated = await updateJob(job.id, {
      status: result.status,
      outputUrl: result.outputUrl ?? null,
      error: result.error ?? null,
    });
    if (result.status === "completed" && result.outputUrl) await attachOutput(updated, result.outputUrl);
    return updated;
  } catch (error: any) {
    const attempts = Number(job.attempts ?? 0) + 1;
    return updateJob(job.id, {
      status: attempts >= 5 ? "failed" : "processing",
      error: String(error?.message ?? "media polling failed").slice(0, 2000),
      attempts: String(attempts),
    });
  }
}

export async function createMediaJob(input: {
  userId: string;
  companyId: string;
  contentId?: string | null;
  task: MediaTask;
  prompt: string;
  inputUrl?: string | null;
  outputIndex?: number | null;
  format?: MediaFormat;
  configId?: string | null;
}) {
  const { config, model } = await getMediaConfig(input.userId, input.task, input.configId);
  const mediaProviders = ["runway", "vertex", "luma", "kling"];
  const isOpenRouter = config.provider === "openrouter";
  if (!mediaProviders.includes(config.provider) && !isOpenRouter) {
    throw new Error(`${config.provider} does not support media generation`);
  }
  const now = new Date().toISOString();
  const [job] = await db.insert(mediaJobs).values({
    userId: input.userId,
    companyId: input.companyId,
    contentId: input.contentId ?? null,
    configId: config.id,
    provider: config.provider,
    model,
    task: input.task,
    prompt: input.prompt.slice(0, 12000),
    inputUrl: input.inputUrl ?? null,
    format: input.format ?? null,
    outputIndex: input.outputIndex == null ? null : String(input.outputIndex),
    routerConfigId: (config as any).configId ?? null,
    status: "queued",
    attempts: "0",
    createdAt: now,
    updatedAt: now,
  } as any).returning();
  void submitMediaJob(job.id);
  return job;
}

export async function queueContentMedia(input: {
  userId: string;
  companyId: string;
  contentId: string;
  kind: string;
  images?: Array<{ url: string; text: string }> | null;
  scripts?: Array<{ type: string; prompt: string }> | null;
  format?: MediaFormat;
  influencerImageUrl?: string | null;
}) {
  const jobs: any[] = [];
  const task: MediaTask = input.kind === "carousel" ? "image" : "video";
  // ponytail: video renders explicitly via POST /contents/:id/render (N=duration/5 chunks).
  // Auto-queueing a single 5s job here used to race render and short-circuit it to 5s.
  if (task === "video") return jobs;
  try {
    if (task === "image") {
      for (const [index, image] of (input.images ?? []).entries()) {
        jobs.push(await createMediaJob({
          ...input,
          task,
          prompt: `Create a social media image for this slide. Caption/text concept: ${image.text}`,
          inputUrl: null,
          outputIndex: index,
        }));
      }
    }
  } catch {
    // Content remains usable when media credentials are not configured. The
    // explicit /media/jobs endpoint returns the actionable configuration error.
  }
  return jobs;
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;
const inFlightSubmissions = new Set<string>();

export function startMediaWorker() {
  if (workerTimer) return () => {};
  const tick = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      const jobs = await db.select().from(mediaJobs).where(inArray(mediaJobs.status, ["queued", "processing"] as any)).orderBy(asc(mediaJobs.updatedAt)).limit(20);
      for (const job of jobs) {
        if (job.status === "queued") await submitMediaJob(job.id);
        else await pollMediaJob(job.id);
      }
    } catch {
      // Individual provider errors are persisted on their job; worker errors
      // must not terminate the application process.
    } finally {
      workerBusy = false;
    }
  };
  workerTimer = setInterval(() => void tick(), 10000);
  (workerTimer as any).unref?.();
  void tick();
  return () => {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  };
}
