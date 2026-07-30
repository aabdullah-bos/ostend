import { createServer } from "node:http";

import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";

export class ReadinessState {
  public constructor(private acceptingTraffic = true) {}

  public isReady(): boolean {
    return this.acceptingTraffic;
  }

  public stopAcceptingTraffic(): void {
    this.acceptingTraffic = false;
  }
}

export function buildApp(
  config: AppConfig,
  readiness = new ReadinessState()
): FastifyInstance {
  const app = Fastify({
    logger: false,
    requestTimeout: config.requestTimeoutMs,
    serverFactory: (handler) =>
      createServer(
        {
          maxHeaderSize: config.maxHeaderBytes,
          requestTimeout: config.requestTimeoutMs
        },
        handler
      )
  });

  app.get("/healthz", async () => ({ status: "healthy" }));
  app.get("/readyz", async (_request, reply) => {
    if (!readiness.isReady()) {
      return reply.code(503).send({ status: "not_ready" });
    }
    return { status: "ready" };
  });

  return app;
}
