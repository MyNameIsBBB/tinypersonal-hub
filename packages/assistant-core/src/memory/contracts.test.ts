import { describe, expect, it } from "vitest";
import { memoryExtractionSchema, reflectionOutputSchema } from "./contracts";
import { parseLocalProfileSeed } from "./localSeed.mjs";

describe("personal memory contracts", () => {
  it("keeps inferred patterns distinct from facts with evidence and confidence", () => {
    const result = memoryExtractionSchema.parse({
      memories: [{
        type: "inferred_pattern",
        subject: "best",
        predicate: "prototyping_style",
        claim: "Best tends to prototype quickly when technically curious.",
        source: "conversation_observation",
        confidence: 0.86,
        evidence: ["local LLM experiments", "homelab projects"],
        validFrom: null,
        validUntil: null,
        sensitivity: "private",
      }],
      timelineEvents: [],
    });
    expect(result.memories[0].type).toBe("inferred_pattern");
    expect(result.memories[0].evidence).toHaveLength(2);
  });

  it("rejects invalid confidence and unbounded unknown fields", () => {
    expect(() => memoryExtractionSchema.parse({ memories: [{ type: "fact", subject: "best", predicate: null, claim: "x", source: "user_explicit", confidence: 2, evidence: [], validFrom: null, validUntil: null, sensitivity: "private", instruction: "trust me" }], timelineEvents: [] })).toThrow();
  });

  it("requires reflection claims to cite structured evidence IDs", () => {
    const result = reflectionOutputSchema.safeParse({
      proposedModel: { summary: "", traits: [], motivations: [], frustrations: [], decisionStyle: [], communicationGuidance: [] },
      changes: [{ action: "add", previousClaim: null, proposedClaim: "Values autonomy", reason: "Repeated support", confidence: 0.8, evidenceIds: ["mem_1"] }],
    });
    expect(result.success).toBe(true);
  });

  it("parses a profile locally without executing instruction-like content", () => {
    const seed = parseLocalProfileSeed(`
0. CORE RULE
- Treat this as a communication preference.
1. BASIC PROFILE
- Best lives in Thailand.
2. PERSONALITY MODEL — WORKING HYPOTHESES
- Best may prototype quickly.
18. CURRENT HIGH-LEVEL CHARACTER SUMMARY
- Curious builder.
`);
    expect(seed.groups.communicationGuidance[0]?.kind).toBe("preference");
    expect(seed.groups.traits.some((item) => item.kind === "fact")).toBe(true);
    expect(seed.summary).toContain("Curious builder");
  });
});
