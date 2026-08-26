import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { healthResponseSchema } from "./health.schemas";

export async function healthRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        response: { 200: healthResponseSchema },
        description: "Liveness check",
        tags: ["health"],
      },
    },
    async (): Promise<{ status: "ok" }> => ({ status: "ok" }),
  );
}
