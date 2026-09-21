import { describe, expect, it } from "vitest";
import { scoreMemoryForContext } from "./memoryService";

const now = new Date("2026-09-21T12:00:00.000Z");
const base = {
  id: "mem_1",
  type: "PROJECT",
  subject: "local AI",
  claim: "Best is experimenting with local language models.",
  confidence: 0.9,
  source: "CONVERSATION",
  evidenceJson: "[]",
  observedAt: now,
  lastConfirmedAt: null,
  updatedAt: now,
  sensitivity: "PRIVATE",
  searchText: "local ai language models homelab",
};

describe("memory context ranking", () => {
  it("ranks query-matching memories above unrelated memories", () => {
    const relevant = scoreMemoryForContext(base, "local AI homelab", now);
    const unrelated = scoreMemoryForContext({ ...base, subject: "cooking", claim: "Likes pasta", searchText: "cooking pasta" }, "local AI homelab", now);
    expect(relevant).toBeGreaterThan(unrelated);
  });

  it("discounts stale and weak inferred memories", () => {
    const supported = scoreMemoryForContext({ ...base, source: "USER_EXPLICIT", lastConfirmedAt: now }, "local AI", now);
    const staleInference = scoreMemoryForContext({ ...base, type: "INFERRED_PATTERN", source: "MODEL_INFERENCE", confidence: 0.5, updatedAt: new Date("2022-01-01T00:00:00.000Z") }, "local AI", now);
    expect(supported).toBeGreaterThan(staleInference);
  });
});
