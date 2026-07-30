import { describe, expect, it } from "vitest";

import {
  classifyAgentInteraction,
  type DeclarationReasonCode
} from "../../src/protocol/agent-interaction.js";

describe("classifyAgentInteraction", () => {
  it("classifies the exact Version 1 declaration as valid autonomous context", () => {
    expect(
      classifyAgentInteraction({
        "agent-interaction": "actor=agent, mode=autonomous, version=1"
      })
    ).toEqual({
      classification: "valid",
      mode: "autonomous",
      profileVersion: 1
    });
  });

  it("classifies an absent declaration as missing and never human", () => {
    expect(classifyAgentInteraction({})).toEqual({
      classification: "missing",
      mode: "unspecified"
    });
  });

  it("matches the HTTP field name case-insensitively", () => {
    expect(
      classifyAgentInteraction({
        "AgEnT-InTeRaCtIoN": "actor=agent, mode=autonomous, version=1"
      })
    ).toMatchObject({
      classification: "valid",
      mode: "autonomous"
    });
  });

  it.each([
    [
      "missing_member",
      "actor=agent, mode=autonomous"
    ],
    [
      "unknown_member",
      "actor=agent, mode=autonomous, version=1, purpose=test"
    ],
    [
      "unsupported_actor",
      "actor=human, mode=autonomous, version=1"
    ],
    [
      "unsupported_mode",
      "actor=agent, mode=supervised, version=1"
    ],
    [
      "unsupported_version",
      'actor=agent, mode=autonomous, version="one"'
    ],
    [
      "syntax_error",
      "actor=agent, mode=autonomous, version=("
    ]
  ] satisfies ReadonlyArray<readonly [DeclarationReasonCode, string]>)(
    "returns bounded reason %s without retaining the raw declaration",
    (reasonCode, declaration) => {
      const result = classifyAgentInteraction({
        "agent-interaction": declaration
      });

      expect(result).toEqual({
        classification: "invalid",
        mode: "unspecified",
        reasonCode
      });
      expect(JSON.stringify(result)).not.toContain(declaration);
    }
  );

  it("classifies a structurally valid future version as unsupported", () => {
    expect(
      classifyAgentInteraction({
        "agent-interaction": "actor=agent, mode=autonomous, version=2"
      })
    ).toEqual({
      classification: "unsupported",
      mode: "unspecified",
      profileVersion: 2,
      reasonCode: "unsupported_version"
    });
  });

  it.each([
    {
      "agent-interaction": [
        "actor=agent, mode=autonomous, version=1",
        "actor=agent, mode=autonomous, version=1"
      ]
    },
    {
      "agent-interaction": "actor=agent, mode=autonomous, version=1",
      "Agent-Interaction": "actor=agent, mode=autonomous, version=1"
    },
    {
      "agent-interaction":
        "actor=agent, actor=agent, mode=autonomous, version=1"
    }
  ])("rejects duplicate declarations or dictionary members", (headers) => {
    expect(classifyAgentInteraction(headers)).toEqual({
      classification: "invalid",
      mode: "unspecified",
      reasonCode: "duplicate_declaration"
    });
  });

  it.each([
    "actor=agent;source=test, mode=autonomous, version=1",
    "actor=agent, mode=autonomous, version=1;extension=test"
  ])("rejects unreviewed parameters as unsupported members", (declaration) => {
    expect(
      classifyAgentInteraction({ "agent-interaction": declaration })
    ).toEqual({
      classification: "invalid",
      mode: "unspecified",
      reasonCode: "unknown_member"
    });
  });

  it("contains parser failures and always returns a classification", () => {
    expect(() =>
      classifyAgentInteraction({
        "agent-interaction": 'actor="unterminated'
      })
    ).not.toThrow();
  });
});
