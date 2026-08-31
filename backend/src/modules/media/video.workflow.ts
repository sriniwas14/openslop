import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { and, eq } from "drizzle-orm";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "../../lib/db";
import { contents, mediaJobs, aiConfigs, aiPreferences, influencers } from "../../db/schema";
import { createMediaJob, pollMediaJob } from "./media.service";

// ponytail: local file storage — backend/data/media/<contentId>.mp4 served via /media/files/
function mediaDir() {
  return path.join(process.cwd(), "data", "media");
}
function extFromOutput(outputUrl: string, fallback = "mp4") {
  if (outputUrl.startsWith("data:")) {
    const m = outputUrl.match(/^data:([^;]+);/);
    if (m?.[1]?.includes("image")) return "png";
    return fallback;
  }
  try {
    const u = new URL(outputUrl);
    const ext = path.extname(u.pathname).slice(1);
    if (ext) return ext.slice(0, 8);
  } catch {}
  return fallback;
}

async function downloadToLocal(outputUrl: string, contentId: string, suffix = ""): Promise<{ localUrl: string; filePath: string }> {
  const dir = mediaDir();
  await mkdir(dir, { recursive: true });
  const ext = extFromOutput(outputUrl, "mp4");
  const filename = `${contentId}${suffix}_${Date.now()}.${ext}`;
  const filepath = path.join(dir, filename);

  if (outputUrl.startsWith("data:")) {
    const comma = outputUrl.indexOf(",");
    const b64 = comma === -1 ? "" : outputUrl.slice(comma + 1);
    const buf = Buffer.from(b64, "base64");
    await writeFile(filepath, buf);
  } else {
    const res = await fetch(outputUrl);
    if (!res.ok) throw new Error(`failed to download media ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error("downloaded media was empty");
    await writeFile(filepath, buf);
  }
  return { localUrl: `/media/files/${filename}`, filePath: filepath };
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: "ignore" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ffmpeg ${args.join(" ")}`))));
  });
}

async function extractLastFrame(videoPath: string, outPngPath: string): Promise<void> {
  // ponytail: 1 frame, no re-encode — cheap, no referenceVideo cost
  await runFfmpeg(["-y", "-sseof", "-0.2", "-i", videoPath, "-vframes", "1", "-q:v", "2", outPngPath]);
}

async function concatVideos(partPaths: string[], outPath: string): Promise<void> {
  const dir = path.dirname(outPath);
  const listPath = path.join(dir, `concat_${Date.now()}.txt`);
  const listContent = partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(listPath, listContent);
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
  } catch {
    // fallback re-encode if copy fails (different codecs)
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", outPath]);
  } finally {
    try { await unlink(listPath); } catch {}
  }
}

function splitIntoChunks(scripts: Array<{ type: string; prompt: string }>, n: number): string[] {
  if (n <= 1) return [scripts.map((s, i) => `Beat ${i + 1} (${s.type}): ${s.prompt}`).join("\n\n")];
  // distribute beats round-robin to keep aroll/broll mix per chunk
  const chunks: string[][] = Array.from({ length: n }, () => []);
  scripts.forEach((s, idx) => {
    const chunkIdx = Math.floor((idx * n) / scripts.length);
    chunks[chunkIdx].push(`Beat ${idx + 1} (${s.type}): ${s.prompt}`);
  });
  // if beats < n, some chunks empty — fill by splitting longest prompt sentences
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length === 0) {
      // split the longest chunk's first entry
      const srcIdx = chunks.findIndex((c) => c.length > 1);
      if (srcIdx !== -1) {
        const moved = chunks[srcIdx].pop()!;
        chunks[i].push(moved);
      } else {
        chunks[i].push(`Continuation of previous scene — maintain style and characters`);
      }
    }
  }
  return chunks.map((c) => c.join("\n\n").slice(0, 12000));
}

async function tryUploadToRunway(pngPath: string, apiKey: string): Promise<string | null> {
  try {
    const buf = await readFile(pngPath);
    // Runway uploads endpoint: POST /v1/uploads with binary — per docs, not strictly needed but promptImage can be data URI for small images
    // Try data URI first (cheaper, no extra call) — provider may accept it; we return data URI
    const b64 = buf.toString("base64");
    return `data:image/png;base64,${b64}`;
  } catch { return null; }
}

async function ensureDurationColumn() {
  try {
    // ponytail: existing DBs prior to duration column — add lazily
    await db.run(`ALTER TABLE content ADD COLUMN duration TEXT` as any);
  } catch {}
  try { await db.run(`ALTER TABLE content ADD COLUMN influencer_id TEXT` as any); } catch {}
}

async function influencerToDataUri(influencerId: string, userId: string): Promise<string | null> {
  try {
    const [inf] = await db.select().from(influencers).where(and(eq(influencers.id, influencerId), eq(influencers.userId, userId)));
    if (!inf) return null;
    const url = inf.imageUrl;
    if (url.startsWith("data:")) return url;
    if (url.startsWith("/media/files/")) {
      const buf = await readFile(path.join(process.cwd(), "data", "media", url.replace("/media/files/", "")));
      const ext = url.endsWith(".png") ? "image/png" : url.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return `data:${ext};base64,${buf.toString("base64")}`;
    }
    if (url.startsWith("http")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get("content-type") || "image/png";
      return `data:${ct};base64,${buf.toString("base64")}`;
    }
    return null;
  } catch { return null; }
}

const fetchContentStep = createStep({
  id: "fetch-content",
  inputSchema: z.object({ contentId: z.string().min(1), userId: z.string().min(1) }),
  outputSchema: z.object({
    contentId: z.string(),
    userId: z.string(),
    companyId: z.string(),
    kind: z.string(),
    format: z.string().nullable(),
    duration: z.number().int(),
    scripts: z.array(z.object({ type: z.string(), prompt: z.string() })),
    chunkPrompts: z.array(z.string()),
    influencerId: z.string().nullable(),
    influencerImageUrl: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    let row: any;
    try {
      const [r] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, inputData.contentId), eq(contents.userId, inputData.userId)));
      row = r;
    } catch (e: any) {
      if (String(e?.message ?? "").includes("no such column")) {
        await ensureDurationColumn();
        const [r] = await db
          .select()
          .from(contents)
          .where(and(eq(contents.id, inputData.contentId), eq(contents.userId, inputData.userId)));
        row = r;
      } else throw e;
    }
    if (!row) throw new Error("Content not found");
    if (row.kind === "carousel") throw new Error("video not available for carousel");
    if (!["talkinghead", "greenscreen"].includes(row.kind)) throw new Error(`unsupported kind ${row.kind}`);
    const parsed = row.scripts ? (JSON.parse(row.scripts) as Array<{ type: string; prompt: string }>) : null;
    if (!parsed || parsed.length === 0) throw new Error("content has no scripts — cannot render video");
    const duration = row.duration ? Number(row.duration) : 15;
    if (![15, 30, 45].includes(duration)) throw new Error(`invalid duration ${duration}`);
    const n = duration / 5;
    const chunkPrompts = splitIntoChunks(parsed, n);
    const influencerId = (row as any).influencerId ?? (row as any).influencer_id ?? null;
    let influencerImageUrl: string | null = null;
    if (influencerId) {
      influencerImageUrl = await influencerToDataUri(influencerId, row.userId);
      if (!influencerImageUrl) throw new Error("influencer image unavailable — re-select influencer");
    } else if (row.kind === "talkinghead") {
      throw new Error("influencer required for talkinghead — select an influencer");
    }
    return {
      contentId: row.id,
      userId: row.userId,
      companyId: row.companyId,
      kind: row.kind,
      format: row.format,
      duration,
      scripts: parsed,
      chunkPrompts,
      influencerId,
      influencerImageUrl,
    };
  },
});

async function pollJobUntilDone(jobId: string, timeoutMs = 300_000): Promise<any> {
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId));
    if (!job) throw new Error("media job not found");
    if (job.status === "completed" && job.outputUrl) return job;
    if (job.status === "failed") throw new Error(job.error || "video generation failed");
    if (job.status === "queued") await pollMediaJob(job.id);
    else if (job.status === "processing" && job.providerTaskId) await pollMediaJob(job.id);
    await new Promise((r) => setTimeout(r, 5000));
  }
  const [job] = await db.select().from(mediaJobs).where(eq(mediaJobs.id, jobId));
  throw new Error(job?.error || "video generation timed out — still processing, try again shortly");
}

const chunkedRenderStep = createStep({
  id: "chunked-render",
  inputSchema: z.object({
    contentId: z.string(),
    userId: z.string(),
    companyId: z.string(),
    format: z.string().nullable(),
    duration: z.number().int(),
    chunkPrompts: z.array(z.string()),
    influencerId: z.string().nullable().optional(),
    influencerImageUrl: z.string().nullable().optional(),
  }),
  outputSchema: z.object({ contentId: z.string(), mediaUrl: z.string().nullable(), parts: z.number() }),
  execute: async ({ inputData }) => {
    // check ffmpeg exists once
    try { await runFfmpeg(["-version"]); } catch { throw new Error("ffmpeg not installed — install ffmpeg in backend container to enable chunked rendering"); }

    // check for in-flight render for this content — reuse to avoid double billing
    const existing = await db.select().from(mediaJobs).where(and(eq(mediaJobs.contentId, inputData.contentId), eq(mediaJobs.userId, inputData.userId)));
    const inflight = existing.find((j) => j.status === "queued" || j.status === "processing");
    if (inflight) {
      // if already rendering, wait for it instead of starting new chunks
      const job = await pollJobUntilDone(inflight.id);
      const { localUrl } = await downloadToLocal(job.outputUrl, inputData.contentId, "_resume");
      await db.update(contents).set({ mediaUrl: localUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, inputData.contentId));
      return { contentId: inputData.contentId, mediaUrl: localUrl, parts: 1 };
    }

    const dir = mediaDir();
    await mkdir(dir, { recursive: true });

    // resolve video apiKey for upload fallback (for runway promptImage data URI)
    let videoApiKey: string | null = null;
    try {
      const [pref] = await db.select().from(aiPreferences).where(eq(aiPreferences.userId, inputData.userId));
      if (pref?.videoConfigId) {
        const [cfg] = await db.select().from(aiConfigs).where(eq(aiConfigs.id, pref.videoConfigId));
        videoApiKey = cfg?.apiKey ?? null;
      }
    } catch {}

    const partPaths: string[] = [];
    let lastFrameInput: string | null = (inputData as any).influencerImageUrl ?? null; // influencer image for first chunk, then last frame

    for (let idx = 0; idx < inputData.chunkPrompts.length; idx++) {
      const prompt = inputData.chunkPrompts[idx];
      const job = await createMediaJob({
        userId: inputData.userId,
        companyId: inputData.companyId,
        contentId: inputData.contentId,
        task: "video",
        prompt,
        inputUrl: lastFrameInput,
        format: inputData.format as any,
      });
      const done = await pollJobUntilDone(job.id);
      const { filePath } = await downloadToLocal(done.outputUrl, inputData.contentId, `_part${idx}`);
      partPaths.push(filePath);

      if (idx < inputData.chunkPrompts.length - 1) {
        const framePng = path.join(dir, `${inputData.contentId}_part${idx}_last_${Date.now()}.png`);
        await extractLastFrame(filePath, framePng);
        // ponytail: image frame is cheap — data URI avoids extra upload cost vs referenceVideo
        const dataUri = await tryUploadToRunway(framePng, videoApiKey ?? "");
        lastFrameInput = dataUri;
        // keep png for debugging; not deleted immediately
      }
    }

    if (partPaths.length === 1) {
      const filename = path.basename(partPaths[0]);
      const localUrl = `/media/files/${filename}`;
      await db.update(contents).set({ mediaUrl: localUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, inputData.contentId));
      return { contentId: inputData.contentId, mediaUrl: localUrl, parts: 1 };
    }

    // concat parts
    const finalFilename = `${inputData.contentId}_final_${Date.now()}.mp4`;
    const finalPath = path.join(dir, finalFilename);
    await concatVideos(partPaths, finalPath);
    const finalUrl = `/media/files/${finalFilename}`;
    await db.update(contents).set({ mediaUrl: finalUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, inputData.contentId));
    return { contentId: inputData.contentId, mediaUrl: finalUrl, parts: partPaths.length };
  },
});

export const contentVideoWorkflow = createWorkflow({
  id: "content-video-workflow",
  inputSchema: z.object({ contentId: z.string().min(1), userId: z.string().min(1) }),
  outputSchema: z.object({ contentId: z.string(), mediaUrl: z.string().nullable(), parts: z.number() }),
  retryConfig: { attempts: 0 },
})
  .then(fetchContentStep)
  .then(chunkedRenderStep)
  .commit();

// ponytail: helper for REST endpoint — blocks until completed/failed (throws on error)
// tries workflow.execute first; falls back to sequential steps if mastra API differs
export async function renderVideoForContent(contentId: string, userId: string) {
  try {
    const run: any = await (contentVideoWorkflow as any).execute({ inputData: { contentId, userId } });
    const out: any = run?.result ?? run?.output ?? run?.value ?? run;
    if (out?.mediaUrl !== undefined) return out;
    if (run?.status === "success" && out) return out;
  } catch {
    // fall through to direct steps
  }
  // ponytail: direct steps — same logic, no workflow runner dependency
  const fetched = await (fetchContentStep as any).execute({ inputData: { contentId, userId } } as any);
  const fetchedOut = fetched?.output ?? fetched?.result ?? fetched;
  const chunkedRaw = await (chunkedRenderStep as any).execute({ inputData: fetchedOut } as any);
  return chunkedRaw?.output ?? chunkedRaw?.result ?? chunkedRaw;
}
