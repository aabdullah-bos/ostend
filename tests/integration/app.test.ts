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

describe("application foundation", () => {
  it("is ready to accept registered routes", async () => {
    const app = buildApp(config);
    app.get("/foundation-check", async () => ({ status: "ready" }));

    const response = await app.inject({
      method: "GET",
      url: "/foundation-check"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });

    await app.close();
  });
});
