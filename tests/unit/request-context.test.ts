import { describe, expect, it } from "vitest";

import { createRequestContext } from "../../src/request-context.js";

describe("createRequestContext", () => {
  it("classifies raw field lines and generates an opaque identifier", () => {
    const context = createRequestContext([
      "Agent-Interaction",
      "actor=agent, mode=autonomous, version=1"
    ]);

    expect(context.declaration).toMatchObject({
      classification: "valid",
      mode: "autonomous",
      profileVersion: 1
    });
    expect(context.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("preserves repeated field lines for duplicate classification", () => {
    const declaration = "actor=agent, mode=autonomous, version=1";
    const context = createRequestContext([
      "Agent-Interaction",
      declaration,
      "agent-interaction",
      declaration
    ]);

    expect(context.declaration).toMatchObject({
      classification: "invalid",
      mode: "unspecified",
      reasonCode: "duplicate_declaration"
    });
  });
});
