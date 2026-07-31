import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";

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

  it("allows an in-flight upstream request to complete during graceful shutdown", async () => {
    const upstream = createServer((_incoming, response) => {
      setTimeout(() => response.end("completed"), 50);
    });
    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", resolve);
    });

    const upstreamPort = (upstream.address() as AddressInfo).port;
    const readiness = new ReadinessState();
    const app = buildApp({
      ...config,
      upstreamOrigin: new URL(`http://127.0.0.1:${upstreamPort}`),
      deploymentMode: "local",
      shutdownGraceMs: 500
    }, readiness);
    await app.listen({ host: "127.0.0.1", port: 0 });
    const proxyPort = (app.server.address() as AddressInfo).port;

    const response = new Promise<{ statusCode: number; body: string }>(
      (resolve, reject) => {
        const outgoing = request(
          { host: "127.0.0.1", port: proxyPort, path: "/in-flight" },
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
        outgoing.end();
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    const shutdown = shutdownApp(app, readiness, 500);

    await expect(response).resolves.toEqual({
      statusCode: 200,
      body: "completed"
    });
    await shutdown;
    expect(readiness.isReady()).toBe(false);

    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
