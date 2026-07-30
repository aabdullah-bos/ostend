import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import {
  classifyAgentInteraction,
  type DeclarationResult,
  type HeaderFields
} from "./protocol/agent-interaction.js";

export interface OstendRequestContext {
  readonly requestId: string;
  readonly declaration: DeclarationResult;
}

declare module "fastify" {
  interface FastifyRequest {
    ostendContext: OstendRequestContext;
  }
}

function headerFieldsFromRaw(rawHeaders: readonly string[]): HeaderFields {
  const fields: Record<string, string | string[]> = {};

  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index];
    const value = rawHeaders[index + 1] ?? "";
    const existing = fields[name];

    if (existing === undefined) {
      fields[name] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      fields[name] = [existing, value];
    }
  }

  return fields;
}

export function createRequestContext(
  rawHeaders: readonly string[]
): OstendRequestContext {
  return Object.freeze({
    requestId: randomUUID(),
    declaration: classifyAgentInteraction(headerFieldsFromRaw(rawHeaders))
  });
}

export function registerRequestContext(
  app: FastifyInstance,
  config: Pick<AppConfig, "acknowledgementEnabled">
): void {
  app.decorateRequest("ostendContext");

  app.addHook("onRequest", async (request) => {
    request.ostendContext = createRequestContext(request.raw.rawHeaders);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.removeHeader("agent-interaction-accepted");

    if (
      config.acknowledgementEnabled &&
      request.ostendContext.declaration.classification === "valid"
    ) {
      reply.header(
        "agent-interaction-accepted",
        "mode=autonomous, version=1"
      );
    }

    return payload;
  });
}
