import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../../src/config.js";

const hostedEnvironment = {
  UPSTREAM_ORIGIN: "https://upstream.example/base",
  PORT: "3000",
  LOG_LEVEL: "info",
  PROFILE_MODE: "observe",
  REQUEST_TIMEOUT_MS: "5000",
  ACKNOWLEDGEMENT_ENABLED: "false",
  MAX_HEADER_BYTES: "8192",
  DEPLOYMENT_MODE: "hosted",
  SHUTDOWN_GRACE_MS: "10000"
};

describe("loadConfig", () => {
  it("loads a valid hosted observation configuration", () => {
    const config = loadConfig(hostedEnvironment);

    expect(config.upstreamOrigin.href).toBe("https://upstream.example/base");
    expect(config.profileMode).toBe("observe");
    expect(config.acknowledgementEnabled).toBe(false);
  });

  it("rejects missing required settings without echoing their values", () => {
    expect(() =>
      loadConfig({ ...hostedEnvironment, UPSTREAM_ORIGIN: undefined })
    ).toThrow(ConfigError);
  });

  it("rejects non-HTTPS hosted upstreams", () => {
    expect(() =>
      loadConfig({
        ...hostedEnvironment,
        UPSTREAM_ORIGIN: "http://upstream.example"
      })
    ).toThrow("Invalid configuration: UPSTREAM_ORIGIN");
  });

  it.each([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://10.0.0.4:8080",
    "http://192.168.1.10:8080",
    "http://[::1]:8080"
  ])("permits an explicit controlled local HTTP upstream: %s", (origin) => {
    expect(
      loadConfig({
        ...hostedEnvironment,
        DEPLOYMENT_MODE: "local",
        UPSTREAM_ORIGIN: origin
      }).upstreamOrigin.href
    ).toBe(new URL(origin).href);
  });

  it("rejects public HTTP upstreams in local mode", () => {
    expect(() =>
      loadConfig({
        ...hostedEnvironment,
        DEPLOYMENT_MODE: "local",
        UPSTREAM_ORIGIN: "http://example.com"
      })
    ).toThrow("Invalid configuration: UPSTREAM_ORIGIN");
  });

  it("rejects the Node TLS-verification bypass in hosted mode", () => {
    expect(() =>
      loadConfig({
        ...hostedEnvironment,
        NODE_TLS_REJECT_UNAUTHORIZED: "0"
      })
    ).toThrow("Invalid configuration: NODE_TLS_REJECT_UNAUTHORIZED");
  });
});
