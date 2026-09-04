import type { AgentIntent } from "../routing/toolScoper";
import type { ToolName } from "../tools/definitions";

export type AgentEvalCase = {
  id: string;
  prompt: string;
  expectedIntent: AgentIntent;
  expectedTools: ToolName[];
};

export type AgentEvalObservation = {
  caseId: string;
  actualIntent: AgentIntent;
  actualTools: ToolName[];
  argumentValid?: boolean;
  confirmationPolicyCorrect?: boolean;
  executionSucceeded?: boolean;
};

export type AgentEvalMetrics = {
  cases: number;
  intentAccuracy: number;
  toolSelectionAccuracy: number;
  argumentValidity: number | null;
  confirmationPolicy: number | null;
  executionSuccess: number | null;
};

function ratio(values: boolean[]) {
  return values.length === 0 ? null : values.filter(Boolean).length / values.length;
}

function sameTools(actual: ToolName[], expected: ToolName[]) {
  return actual.length === expected.length && actual.every((tool, index) => tool === expected[index]);
}

export function evaluateAgentCases(
  cases: AgentEvalCase[],
  observations: AgentEvalObservation[],
): AgentEvalMetrics {
  const byId = new Map(observations.map((observation) => [observation.caseId, observation]));
  const matched = cases.flatMap((testCase) => {
    const observation = byId.get(testCase.id);
    return observation ? [{ testCase, observation }] : [];
  });
  const defined = (key: "argumentValid" | "confirmationPolicyCorrect" | "executionSucceeded") =>
    matched.flatMap(({ observation }) => observation[key] === undefined ? [] : [observation[key]]);

  return {
    cases: matched.length,
    intentAccuracy: ratio(matched.map(({ testCase, observation }) =>
      testCase.expectedIntent === observation.actualIntent)) ?? 0,
    toolSelectionAccuracy: ratio(matched.map(({ testCase, observation }) =>
      sameTools(observation.actualTools, testCase.expectedTools))) ?? 0,
    argumentValidity: ratio(defined("argumentValid")),
    confirmationPolicy: ratio(defined("confirmationPolicyCorrect")),
    executionSuccess: ratio(defined("executionSucceeded")),
  };
}
