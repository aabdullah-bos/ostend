import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";

describe("application foundation", () => {
  it("is ready to accept registered routes", async () => {
    const app = buildApp();
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
