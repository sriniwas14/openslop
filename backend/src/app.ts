import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { registerSwagger } from "./plugins/swagger";
import { authRoutes } from "./plugins/auth";
import { healthRoutes } from "./modules/health/health.routes";
import { companyRoutes } from "./modules/company/company.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { contentRoutes } from "./modules/content/content.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { startMediaWorker } from "./modules/media/media.service";

export function createApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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

  app.register(authRoutes);
  app.register(registerSwagger);
  app.register(healthRoutes);
  app.register(companyRoutes);
  app.register(aiRoutes);
  app.register(contentRoutes);
  app.register(mediaRoutes);
  const stopMediaWorker = startMediaWorker();
  app.addHook("onClose", async () => stopMediaWorker());

  return app;
}
