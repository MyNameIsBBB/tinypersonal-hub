// Namespaced Foundation and Features
export * as foundation from "./foundation/index";
export * as features from "./features/index";

// Foundation Re-exports
export { createAgentConfig } from "./orchestrator";
export type { PromptContext } from "./prompts/base";
export * from "./contracts";
export { requiredFirstTool, scopeToolsForConversation, scopeToolsForMessage } from "./routing/toolScoper";
export type { AgentDomain, AgentIntent, RequiredToolCall, ToolScope } from "./routing/toolScoper";
export { classifierDecisionSchema, scopeFromClassification } from "./routing/classifier";
export type { ClassifierDecision } from "./routing/classifier";
export { conversationEntitySchema, conversationStateSchema, resolveConversationReference, routeWithState, stateAfterToolResult, stateFromScope } from "./routing/conversationState";
export type { ConversationEntity, ConversationState } from "./routing/conversationState";
export { evaluateAgentCases } from "./evals/framework";
export type { AgentEvalCase, AgentEvalMetrics, AgentEvalObservation, AgentExpectedToolCall, AgentObservedToolCall } from "./evals/framework";
export {
  extractedMemorySchema,
  memoryExtractionSchema,
  memoryReviewSchema,
  memorySeedSchema,
  memorySensitivitySchema,
  memoryTypeSchema,
  proposalReviewSchema,
  reflectionOutputSchema,
  userModelClaimSchema,
  userModelSchema,
} from "./memory/contracts";
export type { ExtractedMemory, MemoryExtraction, ReflectionOutput, UserModel } from "./memory/contracts";

// Feature Re-exports
export * from "./tools/taskSchemas";
export { defineTool, toolContracts } from "./tools/definitions";
export type { ToolContract, ToolName } from "./tools/definitions";
export { routingEvalCases } from "./evals/routingCases";
export { capabilityEvalCases, capabilityEvalObservations } from "./evals/capabilityCases";
