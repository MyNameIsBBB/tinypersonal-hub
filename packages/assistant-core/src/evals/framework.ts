import type { AgentIntent } from "../routing/toolScoper";
import { toolContracts, type ToolName } from "../tools/definitions";

export type AgentExpectedToolCall = {
  toolName: ToolName;
  expectedArguments?: unknown;
  confirmationRequired?: boolean;
};

export type AgentObservedToolCall = {
  toolName: ToolName;
  arguments: unknown;
  confirmationRequested: boolean;
  executionSucceeded?: boolean;
};

export type AgentEvalCase = {
  id: string;
  prompt: string;
  expectedIntent: AgentIntent;
  expectedTools: ToolName[];
  expectedCalls?: AgentExpectedToolCall[];
};

export type AgentEvalObservation = {
  caseId: string;
  actualIntent: AgentIntent;
  actualTools: ToolName[];
  actualCalls?: AgentObservedToolCall[];
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

function matchesExpected(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((value, index) => matchesExpected(actual[index], value));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) =>
      matchesExpected((actual as Record<string, unknown>)[key], value));
  }
  return Object.is(actual, expected);
}

function evaluateCalls(testCase: AgentEvalCase, observation: AgentEvalObservation) {
  if (!testCase.expectedCalls) return null;
  const calls = observation.actualCalls ?? [];
  return testCase.expectedCalls.map((expected, index) => {
    const actual = calls[index];
    const contract = toolContracts[expected.toolName];
    const parsed = actual?.toolName === expected.toolName
      ? contract.input.safeParse(actual.arguments)
      : null;
    const confirmationRequired = expected.confirmationRequired ?? contract.mutation;
    return {
      argumentValid: Boolean(parsed?.success && matchesExpected(parsed.data, expected.expectedArguments)),
      confirmationPolicyCorrect: Boolean(actual && actual.confirmationRequested === confirmationRequired),
      executionSucceeded: actual?.executionSucceeded,
    };
  });
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
  const callResults = matched.flatMap(({ testCase, observation }) =>
    evaluateCalls(testCase, observation) ?? []);

  return {
    cases: matched.length,
    intentAccuracy: ratio(matched.map(({ testCase, observation }) =>
      testCase.expectedIntent === observation.actualIntent)) ?? 0,
    toolSelectionAccuracy: ratio(matched.map(({ testCase, observation }) =>
      sameTools(observation.actualTools, testCase.expectedTools))) ?? 0,
    argumentValidity: ratio(callResults.map(({ argumentValid }) => argumentValid)),
    confirmationPolicy: ratio(callResults.map(({ confirmationPolicyCorrect }) => confirmationPolicyCorrect)),
    executionSuccess: ratio(callResults.flatMap(({ executionSucceeded }) =>
      executionSucceeded === undefined ? [] : [executionSucceeded])),
  };
}
