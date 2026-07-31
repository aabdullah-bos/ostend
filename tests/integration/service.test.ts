import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough, Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";

interface UpstreamRequest {
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  closeCallbacks.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );
  return (server.address() as AddressInfo).port;
}

function call(
  port: number,
  declaration: string | undefined,
  credential: string,
  body: string
): Promise<{ readonly statusCode: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/authorized/resource?private=query-value",
        headers: {
          ...(declaration === undefined
            ? {}
            : { "agent-interaction": declaration }),
          authorization: credential,
          "content-type": "text/plain",
          "content-length": String(Buffer.byteLength(body))
        }
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () =>
          resolve({
            statusCode: incoming.statusCode ?? 0,
            body: Buffer.concat(chunks).toString()
          })
        );
      }
    );
    outgoing.on("error", reject);
    Readable.from([body]).pipe(outgoing);
  });
}

describe("assembled observation-only service", () => {
  it("preserves upstream authorization outcomes across every classification without logging secrets", async () => {
    const received: UpstreamRequest[] = [];
    const upstream = createServer((incoming, response) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        received.push({
          headers: incoming.headers,
          body: Buffer.concat(chunks).toString()
        });
        const authorized = incoming.headers.authorization === "Bearer allowed";
        response.statusCode = authorized ? 202 : 403;
        response.end(authorized ? "upstream accepted" : "upstream denied");
      });
    });
    const upstreamPort = await listen(upstream);

    const logStream = new PassThrough();
    let logs = "";
    logStream.on("data", (chunk: Buffer) => {
      logs += chunk.toString();
    });
    const config: AppConfig = {
      upstreamOrigin: new URL(`http://127.0.0.1:${upstreamPort}`),
      port: 3000,
      logLevel: "info",
      profileMode: "observe",
      requestTimeoutMs: 1_000,
      acknowledgementEnabled: false,
      maxHeaderBytes: 8_192,
      deploymentMode: "local",
      shutdownGraceMs: 1_000,
      pathLoggingMode: "normalized"
    };
    const app = buildApp(config, undefined, logStream);
    await app.listen({ host: "127.0.0.1", port: 0 });
    closeCallbacks.push(() => app.close());
    const proxyPort = (app.server.address() as AddressInfo).port;

    const cases = [
      {
        declaration: "actor=agent, mode=autonomous, version=1",
        credential: "Bearer allowed",
        classification: "valid",
        mode: "autonomous",
        profile: "1",
        statusCode: 202
      },
      {
        declaration: undefined,
        credential: "Bearer denied-missing",
        classification: "missing",
        mode: "unspecified",
        profile: undefined,
        statusCode: 403
      },
      {
        declaration: "not a structured dictionary",
        credential: "Bearer denied-invalid",
        classification: "invalid",
        mode: "unspecified",
        profile: undefined,
        statusCode: 403
      },
      {
        declaration: "actor=agent, mode=autonomous, version=2",
        credential: "Bearer denied-unsupported",
        classification: "unsupported",
        mode: "unspecified",
        profile: "2",
        statusCode: 403
      }
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const result = await call(
        proxyPort,
        testCase.declaration,
        testCase.credential,
        `private-body-${index}`
      );
      expect(result.statusCode).toBe(testCase.statusCode);
      expect(result.body).toBe(
        testCase.statusCode === 202 ? "upstream accepted" : "upstream denied"
      );

      const upstreamRequest = received[index];
      expect(upstreamRequest.headers.authorization).toBe(testCase.credential);
      expect(upstreamRequest.body).toBe(`private-body-${index}`);
      expect(upstreamRequest.headers["proxy-agent-declaration"]).toBe(
        testCase.classification
      );
      expect(upstreamRequest.headers["proxy-agent-mode"]).toBe(testCase.mode);
      expect(upstreamRequest.headers["proxy-agent-profile"]).toBe(
        testCase.profile
      );
    }

    const events = logs
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((event) => event.event_type === "ostend.request.completed");
    expect(events).toHaveLength(cases.length);
    expect(events.map((event) => event.declaration_classification)).toEqual(
      cases.map((testCase) => testCase.classification)
    );
    expect(events.map((event) => event.agent_mode)).toEqual(
      cases.map((testCase) => testCase.mode)
    );
    expect(events.map((event) => event.upstream_response_status)).toEqual(
      cases.map((testCase) => testCase.statusCode)
    );

    for (const testCase of cases) {
      expect(logs).not.toContain(testCase.credential);
      if (testCase.declaration !== undefined) {
        expect(logs).not.toContain(testCase.declaration);
      }
    }
    for (let index = 0; index < cases.length; index += 1) {
      expect(logs).not.toContain(`private-body-${index}`);
    }
    expect(logs).not.toContain("query-value");
  });
});
