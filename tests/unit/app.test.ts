import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";

describe("buildApp", () => {
  it("creates a Fastify application", async () => {
    const app = buildApp();

    expect(app.version).toEqual(expect.any(String));

    await app.close();
  });
});
