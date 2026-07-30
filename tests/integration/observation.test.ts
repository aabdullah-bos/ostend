import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";

const config: AppConfig = {
  upstreamOrigin: new URL("http://127.0.0.1:1"),
  port: 3000,
  logLevel: "info",
  profileMode: "observe",
  requestTimeoutMs: 100,
  acknowledgementEnabled: false,
  maxHeaderBytes: 8_192,
  deploymentMode: "local",
  shutdownGraceMs: 100,
  pathLoggingMode: "normalized"
};

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function captureApp(pathLoggingMode: AppConfig["pathLoggingMode"] = "normalized") {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const app = buildApp({ ...config, pathLoggingMode }, undefined, stream);
  app.post("/patients/:patientId", async (_request, reply) =>
    reply.code(207).send({ confidential: "response-body" })
  );
  apps.push(app);
  return { app, output: () => output };
}

describe("structured observations", () => {
  it.each([
    {
      declaration: "actor=agent, mode=autonomous, version=1",
      classification: "valid",
      mode: "autonomous",
      reason: undefined,
      version: 1
    },
    {
      declaration: "actor=human, mode=autonomous, version=1",
      classification: "invalid",
      mode: "unspecified",
      reason: "unsupported_actor",
      version: 1
    },
    {
      declaration: "actor=agent, mode=autonomous, version=2",
      classification: "unsupported",
      mode: "unspecified",
      reason: "unsupported_version",
      version: 2
    }
  ])(
    "emits exactly one complete deployed JSON event for $classification",
    async ({ declaration, classification, mode, reason, version }) => {
      const { app, output } = captureApp();
      await app.inject({
        method: "POST",
        url: "/patients/123456?token=sensitive-query",
        headers: {
          "agent-interaction": declaration,
          authorization: "Bearer prohibited-credential",
          cookie: "session=prohibited-cookie",
          "content-type": "text/plain"
        },
        payload:
          "prohibited-body prompt memory task-description raw-health-data"
      });

      const lines = output().trim().split("\n");
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]) as Record<string, unknown>;

      expect(event).toMatchObject({
        event_type: "ostend.request.completed",
        http_method: "POST",
        request_path: "/patients/:id",
        declaration_classification: classification,
        agent_mode: mode,
        profile_version: version,
        upstream_response_status: 207,
        proxy_software_version: "0.1.0"
      });
      expect(event.declaration_reason).toBe(reason);
      expect(event.request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(event.timestamp).toEqual(expect.any(String));
      expect(event.request_duration_ms).toEqual(expect.any(Number));

      expect(output()).not.toContain(declaration);
      for (const prohibited of [
        "prohibited-credential",
        "prohibited-cookie",
        "prohibited-body",
        "prompt",
        "memory",
        "task-description",
        "raw-health-data",
        "response-body",
        "sensitive-query",
        "127.0.0.1"
      ]) {
        expect(output()).not.toContain(prohibited);
      }
    }
  );

  it("can redact paths and emits no raw health response data", async () => {
    const { app, output } = captureApp("redacted");
    const response = await app.inject({
      method: "GET",
      url: "/healthz?patient=private"
    });

    expect(response.statusCode).toBe(200);
    const event = JSON.parse(output().trim()) as Record<string, unknown>;
    expect(event.request_path).toBe("/");
    expect(event.upstream_response_status).toBeNull();
    expect(output()).not.toContain("healthy");
    expect(output()).not.toContain("patient");
    expect(output()).not.toContain("private");
  });

  it("sanitizes framework error logs", () => {
    const { app, output } = captureApp();
    const error = Object.assign(
      new Error(
        "connect ECONNREFUSED 127.0.0.1 at /private/project/src/proxy.ts"
      ),
      { code: "ECONNREFUSED", statusCode: 502 }
    );

    app.log.warn({ err: error }, "response errored");

    const entry = JSON.parse(output().trim()) as {
      readonly err: Record<string, unknown>;
    };
    expect(entry.err).toEqual({
      type: "Error",
      message: "Request failed",
      stack: "",
      code: "ECONNREFUSED",
      statusCode: 502
    });
    expect(output()).not.toContain("127.0.0.1");
    expect(output()).not.toContain("/private/project");
    expect(output()).not.toContain("FastifyError:");
  });
});
