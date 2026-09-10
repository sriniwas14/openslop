import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { registerSwagger } from "./plugins/swagger";
import { authRoutes, requireSession } from "./plugins/auth";
import { healthRoutes } from "./modules/health/health.routes";
import { companyRoutes } from "./modules/company/company.routes";
import { brandRoutes } from "./modules/brand/brand.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { contentRoutes } from "./modules/content/content.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { templateRoutes } from "./modules/templates/templates.routes";
import { influencerRoutes } from "./modules/influencer/influencer.routes";
import { instagramRoutes } from "./modules/instagram/instagram.routes";
import { libraryRoutes } from "./modules/library/library.routes";
import { memesRoutes } from "./modules/memes/memes.routes";
import { ugcRoutes } from "./modules/ugc/ugc.routes";
import { visualRoutes } from "./modules/visual/visual.routes";
import { startMediaWorker } from "./modules/media/media.service";
import { startContentGenerationWorker } from "./modules/ugc/ugc.service";
import { startVisualWorker } from "./modules/visual/visual.service";

export function createApp() {
  const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // ponytail: surface zod issues — default 400 hides which field failed
  app.setErrorHandler((err, request, reply) => {
    if ((reply as any).sent || (reply.raw as any).headersSent) return;
    const v = (err as any).validation;
    if (v) {
      request.log.warn({ validation: v }, err.message);
      return reply.status((err as any).statusCode ?? 400).send({ error: err.message, validation: v });
    }
    return reply.send(err);
  });

  // ponytail: local media files — no @fastify/static dep, plain fs stream
  app.get("/media/files/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (!/^[\w.-]+\.(mp4|png|jpg|jpeg|webp|mov|webm)$/i.test(filename)) return reply.status(400).send({ error: "invalid filename" });
    const { createReadStream } = await import("node:fs");
    const { stat } = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), "data", "media", filename);
    try {
      const s = await stat(filePath);
      if (!s.isFile()) return reply.status(404).send({ error: "not found" });
      const ext = path.extname(filename).toLowerCase();
      const ct = ext === ".mp4" ? "video/mp4" : ext === ".webm" ? "video/webm" : ext === ".mov" ? "video/quicktime" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      reply.header("content-type", ct).header("cache-control", "public, max-age=31536000").header("content-length", String(s.size));
      return reply.send(createReadStream(filePath));
    } catch {
      return reply.status(404).send({ error: "not found" });
    }
  });

  // ponytail: same-origin media proxy — canvas export taints on remote
  // visuals without CORS headers; proxying bytes keeps text baked in.
  // SSRF guard: http(s) only, no creds forwarded, 15s timeout, 15MB cap.
  app.get("/media/proxy", async (request, reply) => {
    const { url } = (request.query ?? {}) as { url?: string };
    let target: URL;
    try {
      target = new URL(String(url ?? ""));
    } catch {
      return reply.status(400).send({ error: "invalid url" });
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return reply.status(400).send({ error: "only http(s) allowed" });
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(target.toString(), { signal: ctrl.signal, redirect: "follow" });
      clearTimeout(timer);
      if (!res.ok) return reply.status(502).send({ error: `fetch failed (${res.status})` });
      const ct = res.headers.get("content-type") ?? "";
      if (!/^(image|video)\//.test(ct)) return reply.status(415).send({ error: "not an image/video" });
      const len = Number(res.headers.get("content-length") ?? "0");
      if (len > 15 * 1024 * 1024) return reply.status(413).send({ error: "file too large" });
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 15 * 1024 * 1024) return reply.status(413).send({ error: "file too large" });
      reply.header("content-type", ct).header("cache-control", "public, max-age=86400").header("content-length", String(buf.length));
      return reply.send(buf);
    } catch {
      return reply.status(502).send({ error: "fetch failed" });
    }
  });

  // ponytail: WebM → MP4 transmux — browsers MediaRecorder only emits WebM
  // (unuploadable to IG/TikTok); ffmpeg re-encodes to H.264/AAC server-side.
  // Session-gated: conversion burns CPU, must not be anonymous.
  app.addContentTypeParser("video/webm", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.post("/media/convert", { preHandler: requireSession }, async (request, reply) => {
    const input = request.body as Buffer | undefined;
    if (!input || !(input instanceof Buffer) || input.length === 0) {
      return reply.status(400).send({ error: "empty webm body" });
    }
    if (input.length > 15 * 1024 * 1024) return reply.status(413).send({ error: "file too large" });
    const { spawn } = await import("node:child_process");
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = await mkdtemp(path.join(tmpdir(), "convert-"));
    const inPath = path.join(dir, "in.webm");
    const outPath = path.join(dir, "out.mp4");
    try {
      await writeFile(inPath, input);
      await new Promise<void>((resolve, reject) => {
        const p = spawn("ffmpeg", ["-y", "-i", inPath, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outPath], { stdio: "ignore" });
        p.on("error", reject);
        p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
      });
      const { readFile } = await import("node:fs/promises");
      const mp4 = await readFile(outPath);
      reply.header("content-type", "video/mp4").header("content-length", String(mp4.length));
      return reply.send(mp4);
    } catch (e) {
      request.log.warn({ err: e }, "webm→mp4 conversion failed");
      return reply.status(500).send({ error: "conversion failed — is ffmpeg installed?" });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  app.register(authRoutes);
  app.register(registerSwagger);
  app.register(healthRoutes);
  app.register(companyRoutes);
  app.register(brandRoutes);
  app.register(aiRoutes);
  app.register(contentRoutes);
  app.register(mediaRoutes);
  app.register(templateRoutes);
  app.register(influencerRoutes);
  app.register(instagramRoutes);
  app.register(libraryRoutes);
  app.register(memesRoutes);
  app.register(ugcRoutes);
  app.register(visualRoutes);
  const stopMediaWorker = startMediaWorker();
  const stopContentGenerationWorker = startContentGenerationWorker();
  const stopVisualWorker = startVisualWorker();
  app.addHook("onClose", async () => {
    stopMediaWorker();
    stopContentGenerationWorker();
    stopVisualWorker();
  });

  return app;
}
