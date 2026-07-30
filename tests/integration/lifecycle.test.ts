import { request } from "node:http";

import { describe, expect, it } from "vitest";

import { buildApp, ReadinessState } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import { shutdownApp } from "../../src/lifecycle.js";

const config: AppConfig = {
  upstreamOrigin: new URL("https://upstream.example"),
  port: 3000,
  logLevel: "info",
  profileMode: "observe",
  requestTimeoutMs: 1_500,
  acknowledgementEnabled: false,
  maxHeaderBytes: 1_024,
  deploymentMode: "hosted",
  shutdownGraceMs: 1_000
};

describe("health, readiness, and lifecycle", () => {
  it("reports health and readiness without contacting the upstream", async () => {
    const readiness = new ReadinessState();
    const app = buildApp(config, readiness);

    const health = await app.inject({ method: "GET", url: "/healthz" });
    const ready = await app.inject({ method: "GET", url: "/readyz" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "healthy" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });

    readiness.stopAcceptingTraffic();
    const notReady = await app.inject({ method: "GET", url: "/readyz" });
    expect(notReady.statusCode).toBe(503);
    expect(notReady.json()).toEqual({ status: "not_ready" });

    await app.close();
  });

  it("applies request timeout and request-field size bounds", async () => {
    const app = buildApp(config);
    await app.listen({ host: "127.0.0.1", port: 0 });

    expect(app.server.requestTimeout).toBe(config.requestTimeoutMs);

    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected a TCP listener");
    }

    const statusCode = await new Promise<number | undefined>(
      (resolve, reject) => {
        const outgoing = request(
          {
            host: "127.0.0.1",
            port: address.port,
            path: "/healthz",
            headers: { "x-oversized": "x".repeat(config.maxHeaderBytes + 1) }
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          }
        );
        outgoing.on("error", reject);
        outgoing.end();
      }
    );

    expect(statusCode).toBe(431);
    await app.close();
  });

  it("marks readiness false before graceful close", async () => {
    const readiness = new ReadinessState();
    const app = buildApp(config, readiness);
    await app.listen({ host: "127.0.0.1", port: 0 });

    await shutdownApp(app, readiness, config.shutdownGraceMs);

    expect(readiness.isReady()).toBe(false);
    expect(app.server.listening).toBe(false);
  });
});
