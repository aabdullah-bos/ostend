import { createServer } from "node:http";
import type { Writable } from "node:stream";

import Fastify, { type FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import {
  registerObservations,
  safeErrorSerializer
} from "./observation.js";
import { registerProxyRoutes } from "./proxy.js";
import { registerRequestContext } from "./request-context.js";

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
  readiness = new ReadinessState(),
  logStream?: Writable
): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        err: safeErrorSerializer
      },
      ...(logStream === undefined ? {} : { stream: logStream })
    },
    disableRequestLogging: true,
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

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", (_request, payload, done) => {
    done(null, payload);
  });
  registerRequestContext(app, config);
  registerObservations(app, config);

  app.get("/healthz", async () => ({ status: "healthy" }));
  app.get("/readyz", async (_request, reply) => {
    if (!readiness.isReady()) {
      return reply.code(503).send({ status: "not_ready" });
    }
    return { status: "ready" };
  });
  registerProxyRoutes(app, config);

  return app;
}
