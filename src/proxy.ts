import replyFrom from "@fastify/reply-from";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Agent as HttpAgent, type IncomingHttpHeaders } from "node:http";
import { Agent as HttpsAgent } from "node:https";

import type { AppConfig } from "./config.js";
import type { DeclarationResult } from "./protocol/agent-interaction.js";

const gatewayLabels = {
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout"
} as const;

function forwardRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  timeout: number
): FastifyReply {
  return reply.from(request.raw.url, {
    timeout,
    retriesCount: 0,
    rewriteRequestHeaders: (_outgoingRequest, headers) =>
      normalizedRequestHeaders(headers, request.ostendContext.declaration),
    onError: (outgoingReply, { error }) => {
      const upstreamError = error as Error & { readonly statusCode?: number };
      const statusCode =
        upstreamError.statusCode === 503 || upstreamError.statusCode === 504
          ? upstreamError.statusCode
          : 502;
      void outgoingReply
        .code(statusCode)
        .send({ error: gatewayLabels[statusCode] });
    }
  });
}

function normalizedRequestHeaders(
  incomingHeaders: IncomingHttpHeaders,
  declaration: DeclarationResult
): IncomingHttpHeaders {
  const headers = { ...incomingHeaders };

  for (const name of Object.keys(headers)) {
    if (name.toLowerCase().startsWith("proxy-agent-")) {
      delete headers[name];
    }
  }

  headers["proxy-agent-declaration"] = declaration.classification;
  headers["proxy-agent-mode"] = declaration.mode;
  if (declaration.profileVersion !== undefined) {
    headers["proxy-agent-profile"] = String(declaration.profileVersion);
  }

  return headers;
}

export function registerProxyRoutes(
  app: FastifyInstance,
  config: Pick<AppConfig, "upstreamOrigin" | "requestTimeoutMs">
): void {
  void app.register(replyFrom, {
    base: config.upstreamOrigin.origin,
    disableRequestLogging: true,
    retryMethods: [],
    maxRetriesOn503: 0,
    destroyAgent: true,
    http: {
      agents: {
        "http:": new HttpAgent(),
        "https:": new HttpsAgent({ rejectUnauthorized: true })
      },
      requestOptions: {
        timeout: config.requestTimeoutMs
      }
    }
  });

  const handler = (
    request: FastifyRequest,
    reply: FastifyReply
  ): FastifyReply =>
    forwardRequest(request, reply, config.requestTimeoutMs);

  app.all("/", handler);
  app.all("/*", handler);
}
