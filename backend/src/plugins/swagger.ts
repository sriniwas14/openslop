import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

export const registerSwagger = fp(
  async (app) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "openslop backend",
          description: "openslop API",
          version: "0.1.0",
        },
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, { routePrefix: "/docs" });
  },
);
