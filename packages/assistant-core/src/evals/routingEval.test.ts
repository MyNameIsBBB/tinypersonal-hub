import { describe, expect, it } from "vitest";
import { scopeToolsForMessage } from "../routing/toolScoper";
import { evaluateAgentCases } from "./framework";
import { routingEvalCases } from "./routingCases";

describe("routing evaluation", () => {
  it("maintains a 50-prompt baseline suite", () => {
    expect(routingEvalCases).toHaveLength(50);
  });

  it("reports deterministic intent and tool-selection metrics", () => {
    const observations = routingEvalCases.map((testCase) => {
      const scope = scopeToolsForMessage(testCase.prompt);
      return {
        caseId: testCase.id,
        actualIntent: scope.primaryIntent,
        actualTools: scope.allowedTools,
      };
    });

    expect(evaluateAgentCases(routingEvalCases, observations)).toEqual({
      cases: 50,
      intentAccuracy: 1,
      toolSelectionAccuracy: 1,
      argumentValidity: null,
      confirmationPolicy: null,
      executionSuccess: null,
    });
  });
});
