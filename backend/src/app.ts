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
