// Namespaced Foundation and Features
export * as foundation from "./foundation/index";
export * as features from "./features/index";

// Foundation - Agent Runner & Execution Primitives
export {
  runChatAgent,
  runAgentDirect,
  prepareAgentRun,
} from "./foundation/agent/runner";
export type { RunAgentInput } from "./foundation/agent/runner";
export {
  buildAgentContext,
  formatBangkokDateTime,
  parseBangkokDateTimeInput,
  bangkokNowContext,
  buildScheduleContext,
  selectContextWindow,
  retainChatMessages,
  latestUserText,
  confirmationDecision,
} from "./foundation/agent/contextBuilder";
export type { ContextSource, ContextSensitivity, AgentContextItem } from "./foundation/agent/contextBuilder";
export { createChatTools } from "./foundation/agent/toolAdapterFactory";
export { classifyIntentWithGemini } from "./foundation/agent/intentClassifier";
export {
  createPersistenceEndHandler,
  consumePersistenceStream,
  reserveAssistantMessage,
  messageText,
} from "./foundation/agent/persistence";
export type { PersistenceInput } from "./foundation/agent/persistence";

// Foundation - Core Infrastructure
export { prisma } from "./db/client";
export {
  claimChatGenerationJob,
  completeChatGenerationJob,
  decodeChatGenerationRequest,
  enqueueChatGenerationJob,
  getLatestChatGenerationJob,
  saveUserMessageAndEnqueueChatGeneration,
} from "./services/chatGenerationJobService";
export type { DiscordChatCallback } from "./services/chatGenerationJobService";
export {
  createPendingAction,
  executeAllPendingActions,
  executeLatestPendingAction,
  executePendingAction,
  hasPendingActions,
  recordAudit,
  resolvePendingAction,
  supersedePendingActions,
} from "./services/auditService";
export {
  appendAgentToolTraces,
  completeAgentRunTrace,
  createAgentRunTrace,
  describeAgentError,
  failAgentRunTrace,
  getAgentRunTrace,
  listAgentRunTraces,
} from "./services/agentTraceService";
export type { AgentToolTrace, AgentTraceContextItem } from "./services/agentTraceService";

// Features & Domain Services
export {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  addTaskChecklistItem,
  updateTaskChecklistItem,
  deleteTaskChecklistItem,
  getTodayTasks,
} from "./services/taskService";
export { buildTaskFocus, getTaskFocus } from "./services/taskFocusService";
export type { TaskFocus, TaskFocusItem, TaskFocusReason } from "./services/taskFocusService";
export {
  clearConversationPendingAction,
  createChatSession,
  deleteChatSession,
  ensureDailyGeneralChat,
  generateAndUpdateSessionTitle,
  GENERAL_CHAT_TITLE,
  getOrCreateChatSession,
  listChatSessions,
  loadChatMessages,
  loadConversationState,
  replaceChatMessages,
  resetAllGeneralChats,
  resetGeneralChat,
  saveAssistantChatMessageIfCurrent,
  saveChatMessage,
  saveConversationState,
  saveUserChatMessage,
  updateChatSessionSystemPrompt,
} from "./services/chatService";
export type { StoredChatMessage } from "./services/chatService";
export { getMarketQuotes, integrationHealth } from "./services/integrations";
export type { IntegrationName } from "./services/integrations";
export {
  createProxmoxVm,
  getProxmoxNodeStatus,
  listProxmoxVms,
  proxmoxCreateVmSchema,
  proxmoxHealth,
} from "./services/proxmoxService";
export type {
  ProxmoxCreateVmInput,
  ProxmoxCreateVmResult,
  ProxmoxNodeStatus,
  ProxmoxStatusError,
  ProxmoxVmStatus,
} from "./services/proxmoxService";
export {
  getMorningBriefingContext,
  sendMorningNotification,
} from "./services/morningBriefingService";
export type {
  NewsHeadline,
  MorningBriefingContext,
  NotificationResult,
} from "./services/morningBriefingService";
export {
  hasPushSubscription,
  removePushSubscription,
  savePushSubscription,
  sendDueScheduleNotifications,
  sendWebPushNotification,
} from "./services/pushService";
export type { PushSubscriptionInput } from "./services/pushService";
export { embedToolText, searchToolVectors } from "./services/toolVectorService";
export type { ToolVectorDocument, ToolVectorHit } from "./services/toolVectorService";
export {
  importUserModelSeed,
  listMemoryWorkspace,
  maybeCreateReflectionProposal,
  processConversationMemory,
  retrievePersonalContext,
  reviewMemory,
  reviewUserModelProposal,
  scoreMemoryForContext,
} from "./services/memoryService";
export { scrapeWebPage, searchWeb } from "./services/webService";
export type { ScrapedPage, WebSearchResult } from "./services/webService";
export {
  createScheduleItem,
  deleteOrCancelRoutine,
  deleteScheduleItem,
  getScheduleByRange,
  listActiveRoutines,
  updateScheduleItem,
  updateScheduleStatus,
} from "./services/scheduleService";
export {
  createNote,
  deleteNote,
  searchNotes,
  updateNote,
} from "./services/noteService";
export {
  createVaultSecret,
  deleteVaultSecret,
  revealVaultSecret,
  searchVaultMetadata,
  updateVaultMetadata,
} from "./services/vaultService";
