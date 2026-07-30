import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppConfig } from "./config.js";

export const proxySoftwareVersion = "0.1.0";

const identifierSegment =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[^/@]+@[^/]+|(?=.*\d)[a-z0-9_-]{16,})$/i;

export interface SafeSerializedError {
  readonly [key: string]: unknown;
  readonly type: string;
  readonly message: string;
  readonly stack: string;
}

export function safeErrorSerializer(error: unknown): SafeSerializedError {
  if (typeof error !== "object" || error === null) {
    return { type: "Error", message: "Request failed", stack: "" };
  }

  const candidate = error as {
    readonly code?: unknown;
    readonly name?: unknown;
    readonly statusCode?: unknown;
  };
  return {
    type: typeof candidate.name === "string" ? candidate.name : "Error",
    message: "Request failed",
    stack: "",
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.statusCode === "number"
      ? { statusCode: candidate.statusCode }
      : {})
  };
}

export function observedPath(
  rawUrl: string,
  mode: NonNullable<AppConfig["pathLoggingMode"]> = "normalized"
): string {
  if (mode === "redacted") {
    return "/";
  }

  const pathname = rawUrl.split("?", 1)[0] || "/";
  return pathname
    .split("/")
    .map((segment) => (identifierSegment.test(segment) ? ":id" : segment))
    .join("/");
}

function isOperationalEndpoint(request: FastifyRequest): boolean {
  const path = request.raw.url?.split("?", 1)[0];
  return path === "/healthz" || path === "/readyz";
}

export function registerObservations(
  app: FastifyInstance,
  config: Pick<AppConfig, "pathLoggingMode">
): void {
  app.addHook("onResponse", async (request, reply) => {
    const declaration = request.ostendContext.declaration;
    const durationMs =
      Number(process.hrtime.bigint() - request.ostendContext.startedAt) /
      1_000_000;

    app.log.info({
      event_type: "ostend.request.completed",
      timestamp: new Date().toISOString(),
      request_id: request.ostendContext.requestId,
      http_method: request.method,
      request_path: observedPath(
        request.raw.url ?? "/",
        config.pathLoggingMode ?? "normalized"
      ),
      declaration_classification: declaration.classification,
      agent_mode: declaration.mode,
      ...(declaration.profileVersion === undefined
        ? {}
        : { profile_version: declaration.profileVersion }),
      ...(declaration.reasonCode === undefined
        ? {}
        : { declaration_reason: declaration.reasonCode }),
      upstream_response_status: isOperationalEndpoint(request)
        ? null
        : reply.statusCode,
      request_duration_ms: durationMs,
      proxy_software_version: proxySoftwareVersion
    });
  });
}
