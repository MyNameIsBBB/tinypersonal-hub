import { describe, expect, it } from "vitest";
import { capabilityEvalCases, capabilityEvalObservations } from "./capabilityCases";
import { evaluateAgentCases } from "./framework";

describe("agent capability evaluation", () => {
  it("measures arguments, confirmation policy, and execution outcomes", () => {
    expect(evaluateAgentCases(capabilityEvalCases, capabilityEvalObservations)).toEqual({
      cases: 8,
      intentAccuracy: 1,
      toolSelectionAccuracy: 1,
      argumentValidity: 1,
      confirmationPolicy: 1,
      executionSuccess: 1,
    });
  });

  it("detects schema-invalid args, missing confirmation, and failed execution independently", () => {
    const baseline = capabilityEvalObservations.find(({ caseId }) => caseId === "cap-note-delete")!;
    const broken = {
      ...baseline,
      actualCalls: [{
        toolName: "deleteNote" as const,
        arguments: { noteId: "note-123" },
        confirmationRequested: false,
        executionSucceeded: false,
      }],
    };
    const testCase = capabilityEvalCases.filter(({ id }) => id === broken.caseId);

    expect(evaluateAgentCases(testCase, [broken])).toMatchObject({
      argumentValidity: 0,
      confirmationPolicy: 0,
      executionSuccess: 0,
    });
  });
});
