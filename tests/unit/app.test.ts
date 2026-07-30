import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";

const config: AppConfig = {
  upstreamOrigin: new URL("https://upstream.example"),
  port: 3000,
  logLevel: "info",
  profileMode: "observe",
  requestTimeoutMs: 5_000,
  acknowledgementEnabled: false,
  maxHeaderBytes: 8_192,
  deploymentMode: "hosted",
  shutdownGraceMs: 5_000
};

describe("buildApp", () => {
  it("creates a Fastify application", async () => {
    const app = buildApp(config);

    expect(app.version).toEqual(expect.any(String));

    await app.close();
  });
});
