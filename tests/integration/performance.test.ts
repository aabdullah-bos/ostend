import { describe, expect, it } from "vitest";

import { classifyAgentInteraction } from "../../src/protocol/agent-interaction.js";

const declarationHeaders = {
  "agent-interaction": "actor=agent, mode=autonomous, version=1"
} as const;

function percentile(values: readonly number[], percentileRank: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileRank / 100) * sorted.length) - 1
  );
  return sorted[index];
}

describe("controlled disclosure-processing performance", () => {
  it("keeps classifier application processing under the product target at p95", () => {
    const warmupIterations = 1_000;
    const measuredIterations = 5_000;

    for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
      classifyAgentInteraction(declarationHeaders);
    }

    const samples: number[] = [];
    for (let iteration = 0; iteration < measuredIterations; iteration += 1) {
      const startedAt = process.hrtime.bigint();
      const result = classifyAgentInteraction(declarationHeaders);
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      expect(result.classification).toBe("valid");
      samples.push(elapsedMs);
    }

    const p95Ms = percentile(samples, 95);
    console.info(
      JSON.stringify({
        measurement: "disclosure_processing",
        iterations: measuredIterations,
        p95_ms: Number(p95Ms.toFixed(4)),
        target_p95_ms: 10,
        excludes: ["network", "upstream"]
      })
    );
    expect(p95Ms).toBeLessThanOrEqual(10);
  });
});
