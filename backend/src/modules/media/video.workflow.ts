import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { and, eq } from "drizzle-orm";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { db } from "../../lib/db";
import { env } from "../../env";
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
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", outPath]);
  } finally {
    try { await unlink(listPath); } catch {}
  }
}

// ponytail: ffprobe check — concat assumes N×5s; providers drift, fail loudly instead of shipping short
async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { stdio: ["ignore", "pipe", "ignore"] });
      let s = "";
      p.stdout.on("data", (d) => { s += String(d); });
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve(s) : reject(new Error(`ffprobe exited ${code}`))));
    });
    const v = Number(out.trim());
    return Number.isFinite(v) ? v : null;
  } catch { return null; } // ffprobe missing → skip check, render still usable
}

export type RenderStatus = {
  contentId: string;
  status: "queued" | "rendering" | "completed" | "failed";
  total: number;
  done: number;
  expectedSeconds: number;
  actualSeconds: number | null;
  mediaUrl: string | null;
  error: string | null;
};

// ponytail: in-memory progress — survives polling, resets on restart (jobs table is source of truth)
const renderStates = new Map<string, RenderStatus>();

export function getRenderStatus(contentId: string): RenderStatus | null {
  return renderStates.get(contentId) ?? null;
}

function splitIntoChunks(scripts: Array<{ type: string; prompt: string }>, n: number): string[] {
  const total = n * 5;
  const body = (c: string[]) => c.join("\n\n").slice(0, 11000);
  if (n <= 1) return [`One continuous ${total}s clip — cover all beats in order:\n\n${body(scripts.map((s, i) => `Beat ${i + 1} (${s.type}): ${s.prompt}`))}`];
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
  // ponytail: prefix keeps each 5s provider call anchored to its slot in the N*5s total
  return chunks.map((c, i) => `Clip ${i + 1}/${n} (≈5s of a ${total}s video) — one continuous shot, no cuts:\n\n${body(c)}`);
}

async function tryUploadToRunway(pngPath: string, apiKey: string): Promise<string | null> {
  try {
    const buf = await readFile(pngPath);
    // ponytail: resize last frame to 720p jpeg — raw q:v2 PNG data URIs 413 the provider
    const { toResizedDataUri } = await import("../../lib/image");
    return await toResizedDataUri(buf);
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
    const { toResizedDataUri } = await import("../../lib/image");
    if (url.startsWith("data:")) {
      return toResizedDataUri(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
    }
    if (url.startsWith("/media/files/")) {
      const buf = await readFile(path.join(process.cwd(), "data", "media", url.replace("/media/files/", "")));
      return toResizedDataUri(buf);
    }
    if (url.startsWith("http")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      return toResizedDataUri(Buffer.from(await res.arrayBuffer()));
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

type ChunkedInput = {
  contentId: string;
  userId: string;
  companyId: string;
  format: string | null;
  duration: number;
  chunkPrompts: string[];
  influencerId?: string | null;
  influencerImageUrl?: string | null;
};

async function runChunkedRender(inputData: ChunkedInput): Promise<{ contentId: string; mediaUrl: string | null; parts: number }> {
  const total = inputData.chunkPrompts.length;
  const expected = inputData.duration;

  // ponytail: DRYRUN skips provider calls + ffmpeg — console is the artifact
  if (env.DRYRUN) {
    inputData.chunkPrompts.forEach((p, i) => console.log(`[DRYRUN] chunk ${i + 1}/${total} (${inputData.contentId}):\n${p}\n---`));
    const cur = renderStates.get(inputData.contentId);
    if (cur) {
      cur.status = "completed";
      cur.done = total;
      cur.mediaUrl = null;
      cur.actualSeconds = null;
    }
    return { contentId: inputData.contentId, mediaUrl: null, parts: total };
  }

  // check ffmpeg exists once
  try { await runFfmpeg(["-version"]); } catch { throw new Error("ffmpeg not installed — install ffmpeg in backend container to enable chunked rendering"); }

  const st = renderStates.get(inputData.contentId);
  if (st) {
    st.status = "rendering";
    st.total = total;
    st.expectedSeconds = expected;
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
  const framePngs: string[] = [];
  let lastFrameInput: string | null = (inputData as any).influencerImageUrl ?? null; // influencer image for first chunk, then last frame

  try {
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
      renderStates.get(inputData.contentId)!.done = idx + 1;

      if (idx < inputData.chunkPrompts.length - 1) {
        const framePng = path.join(dir, `${inputData.contentId}_part${idx}_last_${Date.now()}.png`);
        await extractLastFrame(filePath, framePng);
        framePngs.push(framePng);
        // ponytail: image frame is cheap — data URI avoids extra upload cost vs referenceVideo
        const dataUri = await tryUploadToRunway(framePng, videoApiKey ?? "");
        lastFrameInput = dataUri;
      }
    }

    let finalUrl: string;
    let finalPath: string;
    if (partPaths.length === 1) {
      const filename = path.basename(partPaths[0]);
      finalUrl = `/media/files/${filename}`;
      finalPath = partPaths[0];
    } else {
      // concat parts
      const finalFilename = `${inputData.contentId}_final_${Date.now()}.mp4`;
      finalPath = path.join(dir, finalFilename);
      await concatVideos(partPaths, finalPath);
      finalUrl = `/media/files/${finalFilename}`;
    }
    // verify total duration — providers drift per 5s clip
    const actual = await probeDurationSeconds(finalPath);
    if (actual !== null && Math.abs(actual - expected) > 1.5) {
      throw new Error(`rendered video is ${actual.toFixed(1)}s, expected ${expected}s — a clip likely came back short; re-render to retry`);
    }
    await db.update(contents).set({ mediaUrl: finalUrl, updatedAt: new Date().toISOString() }).where(eq(contents.id, inputData.contentId));
    const cur = renderStates.get(inputData.contentId);
    if (cur) {
      cur.status = "completed";
      cur.done = total;
      cur.mediaUrl = finalUrl;
      cur.actualSeconds = actual;
    }
    return { contentId: inputData.contentId, mediaUrl: finalUrl, parts: partPaths.length };
  } finally {
    // ponytail: parts are intermediates — final mp4 is the artifact; keep last-frames only on failure
    const failed = renderStates.get(inputData.contentId)?.status === "failed";
    if (!failed) {
      if (partPaths.length > 1) {
        for (const p of partPaths) { try { await unlink(p); } catch {} }
      }
      for (const f of framePngs) { try { await unlink(f); } catch {} }
    }
  }
}

async function fetchContentForRender(contentId: string, userId: string): Promise<ChunkedInput> {
  const fetched = await (fetchContentStep as any).execute({ inputData: { contentId, userId } } as any);
  return (fetched?.output ?? fetched?.result ?? fetched) as ChunkedInput;
}

// ponytail: background render — POST /render returns 202 immediately; GET /render-status polls.
// A second POST while rendering returns the live state instead of double-billing N clips.
export async function startBackgroundRender(contentId: string, userId: string): Promise<RenderStatus> {
  const live = renderStates.get(contentId);
  if (live && (live.status === "queued" || live.status === "rendering")) return live;
  const fetched = await fetchContentForRender(contentId, userId);
  const total = fetched.chunkPrompts.length;
  const state: RenderStatus = {
    contentId,
    status: "queued",
    total,
    done: 0,
    expectedSeconds: fetched.duration,
    actualSeconds: null,
    mediaUrl: null,
    error: null,
  };
  renderStates.set(contentId, state);
  void (async () => {
    try {
      await runChunkedRender(fetched);
    } catch (e: any) {
      const cur = renderStates.get(contentId);
      if (cur) {
        cur.status = "failed";
        cur.error = String(e?.message ?? "render failed").slice(0, 2000);
      }
    }
  })();
  return state;
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
    return runChunkedRender(inputData as ChunkedInput);
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
  const fetched = await fetchContentForRender(contentId, userId);
  return runChunkedRender(fetched);
}
