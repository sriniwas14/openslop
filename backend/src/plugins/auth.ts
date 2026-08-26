import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare module "fastify" {
  interface FastifyRequest {
    /** populated by requireSession */
    session?: AuthSession;
  }
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  request.session =
    (await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    })) ?? undefined;
  if (!request.session) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });

  app.get("/api/me", { preHandler: requireSession }, async (request) => {
    return request.session;
  });
}
