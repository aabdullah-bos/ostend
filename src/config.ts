import { isIP } from "node:net";

import { z } from "zod";

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

const environmentSchema = z.object({
  UPSTREAM_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65_535),
  LOG_LEVEL: z.enum(logLevels),
  PROFILE_MODE: z.literal("observe"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
  ACKNOWLEDGEMENT_ENABLED: z.enum(["true", "false"]),
  MAX_HEADER_BYTES: z.coerce.number().int().min(1_024),
  DEPLOYMENT_MODE: z.enum(["hosted", "local"]),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().positive(),
  NODE_TLS_REJECT_UNAUTHORIZED: z.string().optional()
});

export interface AppConfig {
  readonly upstreamOrigin: URL;
  readonly port: number;
  readonly logLevel: (typeof logLevels)[number];
  readonly profileMode: "observe";
  readonly requestTimeoutMs: number;
  readonly acknowledgementEnabled: boolean;
  readonly maxHeaderBytes: number;
  readonly deploymentMode: "hosted" | "local";
  readonly shutdownGraceMs: number;
}

export class ConfigError extends Error {
  public constructor(readonly fields: readonly string[]) {
    super(`Invalid configuration: ${fields.join(", ")}`);
    this.name = "ConfigError";
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] === 127)
  );
}

function isControlledLocalHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipVersion = isIP(normalized);

  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    isPrivateIpv4(normalized) ||
    (ipVersion === 6 &&
      (normalized.startsWith("fc") || normalized.startsWith("fd")))
  );
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    throw new ConfigError(
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))]
    );
  }

  const upstreamOrigin = new URL(parsed.data.UPSTREAM_ORIGIN);
  const transportIsValid =
    upstreamOrigin.protocol === "https:" ||
    (parsed.data.DEPLOYMENT_MODE === "local" &&
      upstreamOrigin.protocol === "http:" &&
      isControlledLocalHost(upstreamOrigin.hostname));

  if (!transportIsValid) {
    throw new ConfigError(["UPSTREAM_ORIGIN"]);
  }
  if (
    parsed.data.DEPLOYMENT_MODE === "hosted" &&
    parsed.data.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  ) {
    throw new ConfigError(["NODE_TLS_REJECT_UNAUTHORIZED"]);
  }

  return Object.freeze({
    upstreamOrigin,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    profileMode: parsed.data.PROFILE_MODE,
    requestTimeoutMs: parsed.data.REQUEST_TIMEOUT_MS,
    acknowledgementEnabled: parsed.data.ACKNOWLEDGEMENT_ENABLED === "true",
    maxHeaderBytes: parsed.data.MAX_HEADER_BYTES,
    deploymentMode: parsed.data.DEPLOYMENT_MODE,
    shutdownGraceMs: parsed.data.SHUTDOWN_GRACE_MS
  });
}
