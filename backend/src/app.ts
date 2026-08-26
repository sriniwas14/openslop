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

export function createApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(authRoutes);
  app.register(registerSwagger);
  app.register(healthRoutes);
  app.register(companyRoutes);

  return app;
}
