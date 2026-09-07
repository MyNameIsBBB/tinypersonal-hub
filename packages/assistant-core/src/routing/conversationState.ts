import { z } from "zod";
import { toolContracts, type ToolName } from "../tools/definitions";
import type { AgentDomain, AgentIntent, ToolScope } from "./toolScoper";
import { taskScope } from "./taskRouting";

const agentIntentSchema = z.enum([
  "task.query",
  "task.mutate",
  "general.response",
  "schedule.query",
  "schedule.mutate",
  "notes.query",
  "notes.mutate",
  "vault.query",
  "vault.mutate",
  "web.query",
  "coding.delegate",
  "memory.query",
]);

const agentDomainSchema = z.enum(["coding", "schedule", "notes", "vault", "web", "memory", "task"]);
const entityTypeSchema = z.enum(["schedule", "note", "vault", "codingJob", "task", "taskChecklistItem"]);
const toolNameSchema = z.custom<ToolName>(
  (value) => typeof value === "string" && value in toolContracts,
  "Unknown tool name",
);

export const conversationEntitySchema = z.object({
  type: entityTypeSchema,
  id: z.string().min(1).max(300),
  label: z.string().max(300).optional(),
}).strict();

export const conversationStateSchema = z.object({
  activeIntent: agentIntentSchema.optional(),
  activeDomain: agentDomainSchema.optional(),
  activeTool: toolNameSchema.optional(),
  missingFields: z.array(z.string().min(1).max(100)).max(20).optional(),
  referencedEntity: conversationEntitySchema.optional(),
  recentEntities: z.array(conversationEntitySchema).max(20).optional(),
  pendingActionId: z.string().min(1).max(300).optional(),
  updatedAt: z.string().datetime(),
}).strict();

export type ConversationEntity = z.infer<typeof conversationEntitySchema>;
export type ConversationState = z.infer<typeof conversationStateSchema>;

const stateContinuationPattern = /(?:^\s*(?:\d{1,2}(?::\d{2})?\s*(?:น\.|โมง)|อัน(?:แรก|ที่\s*\d+|นั้น|นี้|เมื่อกี้))\s*$|อัน(?:แรก|ที่\s*\d+|นั้น|นี้|เมื่อกี้)|เปลี่ยนเป็น|เลื่อนไป|ลบอัน|ยกเลิกอัน|ติ๊กอัน|เพิ่ม(?:อีก)?ข้อ)/iu;

function scopeForActiveState(state: ConversationState, message: string): ToolScope | null {
  if (!state.activeDomain || !state.activeIntent || !state.activeTool) return null;
  const remove = /(?:ลบ|ยกเลิก)/u.test(message);
  const update = /(?:เปลี่ยน|เลื่อน|แก้|ติ๊ก|เสร็จ)/u.test(message);
  if (state.activeDomain === "task") {
    const checklist = state.referencedEntity?.type === "taskChecklistItem" || /TaskChecklistItem$/.test(state.activeTool);
    const create = state.activeTool === "createTask" || state.activeTool === "addTaskChecklistItem";
    return taskScope(remove ? "remove" : update ? "update" : create ? "create" : "query", checklist);
  }
  let intent = state.activeIntent;
  let tools: ToolName[];

  if (state.activeDomain === "schedule") {
    intent = remove || update ? "schedule.mutate" : state.activeIntent;
    tools = remove
      ? ["getSchedule", "updateTaskStatus", "deleteRoutine"]
      : update
        ? ["getSchedule", "updateTaskStatus", "updateScheduleItem"]
        : intent === "schedule.mutate"
          ? ["getSchedule", state.activeTool]
          : ["getSchedule"];
  } else if (state.activeDomain === "notes") {
    intent = remove ? "notes.mutate" : update ? "notes.mutate" : state.activeIntent;
    tools = remove
      ? ["searchNotes", "deleteNote"]
      : update
        ? ["searchNotes", "updateNote"]
        : ["searchNotes", state.activeTool];
  } else if (state.activeDomain === "vault") {
    intent = remove ? "vault.mutate" : update ? "vault.mutate" : state.activeIntent;
    tools = remove
      ? ["searchVaultMetadata", "deleteVaultSecret"]
      : update
        ? ["searchVaultMetadata", "updateVaultMetadata"]
        : ["searchVaultMetadata", state.activeTool];
  } else {
    tools = [state.activeTool];
  }

  return {
    primaryIntent: intent,
    intents: [intent],
    allowedTools: [...new Set(tools)],
    confidence: 0.96,
    matchedDomains: [state.activeDomain],
  };
}

export function resolveConversationReference(
  state: ConversationState | null,
  message: string,
): ConversationState | null {
  if (!state?.recentEntities?.length) return state;
  const explicitIndex = message.match(/อันที่\s*(\d+)/u)?.[1];
  const index = /อันแรก/u.test(message)
    ? 0
    : explicitIndex
      ? Number(explicitIndex) - 1
      : /อัน(?:นั้น|นี้|เมื่อกี้)/u.test(message)
        ? 0
        : -1;
  const referencedEntity = state.recentEntities[index];
  return referencedEntity
    ? { ...state, referencedEntity, updatedAt: new Date().toISOString() }
    : state;
}

export function routeWithState(
  message: string,
  direct: ToolScope,
  state: ConversationState | null,
): ToolScope {
  if (direct.primaryIntent !== "general.response" || !stateContinuationPattern.test(message)) return direct;
  const updatedAt = state ? Date.parse(state.updatedAt) : Number.NaN;
  const isFresh = Number.isFinite(updatedAt) && Date.now() - updatedAt <= 6 * 60 * 60 * 1_000;
  return state && isFresh ? scopeForActiveState(state, message) ?? direct : direct;
}

const domainForIntent: Partial<Record<AgentIntent, AgentDomain>> = {
  "task.query": "task",
  "task.mutate": "task",
  "schedule.query": "schedule",
  "schedule.mutate": "schedule",
  "notes.query": "notes",
  "notes.mutate": "notes",
  "vault.query": "vault",
  "vault.mutate": "vault",
  "web.query": "web",
  "coding.delegate": "coding",
  "memory.query": "memory",
};

export function stateFromScope(
  scope: ToolScope,
  previous: ConversationState | null,
): ConversationState | null {
  const activeDomain = domainForIntent[scope.primaryIntent];
  if (!activeDomain) return previous;
  const mutationTool = [...scope.allowedTools].reverse().find((tool) => toolContracts[tool].mutation);
  const activeTool = mutationTool ?? scope.allowedTools[0];
  if (!activeTool) return previous;
  return conversationStateSchema.parse({
    ...previous,
    activeIntent: scope.primaryIntent,
    activeDomain,
    activeTool,
    updatedAt: new Date().toISOString(),
  });
}

const toolState: Partial<Record<ToolName, { domain: AgentDomain; intent: AgentIntent }>> = {
  getTaskFocus: { domain: "task", intent: "task.query" },
  getTasks: { domain: "task", intent: "task.query" },
  getTask: { domain: "task", intent: "task.query" },
  createTask: { domain: "task", intent: "task.mutate" },
  updateTask: { domain: "task", intent: "task.mutate" },
  deleteTask: { domain: "task", intent: "task.mutate" },
  addTaskChecklistItem: { domain: "task", intent: "task.mutate" },
  updateTaskChecklistItem: { domain: "task", intent: "task.mutate" },
  deleteTaskChecklistItem: { domain: "task", intent: "task.mutate" },
  getSchedule: { domain: "schedule", intent: "schedule.query" },
  createScheduleItem: { domain: "schedule", intent: "schedule.mutate" },
  updateTaskStatus: { domain: "schedule", intent: "schedule.mutate" },
  updateScheduleItem: { domain: "schedule", intent: "schedule.mutate" },
  deleteRoutine: { domain: "schedule", intent: "schedule.mutate" },
  searchNotes: { domain: "notes", intent: "notes.query" },
  createNote: { domain: "notes", intent: "notes.mutate" },
  updateNote: { domain: "notes", intent: "notes.mutate" },
  deleteNote: { domain: "notes", intent: "notes.mutate" },
  searchVaultMetadata: { domain: "vault", intent: "vault.query" },
  createVaultSecret: { domain: "vault", intent: "vault.mutate" },
  updateVaultMetadata: { domain: "vault", intent: "vault.mutate" },
  deleteVaultSecret: { domain: "vault", intent: "vault.mutate" },
  searchWeb: { domain: "web", intent: "web.query" },
  fetchWebPage: { domain: "web", intent: "web.query" },
  delegateCodingTask: { domain: "coding", intent: "coding.delegate" },
};

function recordArray(value: unknown, key: string): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const records = (value as Record<string, unknown>)[key];
  return Array.isArray(records)
    ? records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function stateAfterToolResult(
  previous: ConversationState | null,
  toolName: ToolName,
  output: unknown,
): ConversationState | null {
  const tool = toolState[toolName];
  if (!tool) return previous;
  let recentEntities = previous?.recentEntities;
  let referencedEntity = previous?.referencedEntity;
  if (toolName === "getTaskFocus" || toolName === "getTasks" || toolName === "getTask") {
    const tasks = (toolName === "getTaskFocus" ? recordArray(output, "recommended") : recordArray(output, "tasks")).slice(0, 20);
    const taskEntities = tasks.flatMap(item => typeof item.id === "string"
      ? [{ type: "task" as const, id: item.id, label: String(item.title ?? "").slice(0, 300) }] : []);
    if (toolName === "getTask" && tasks.length === 1) {
      referencedEntity = taskEntities[0];
      recentEntities = recordArray(tasks[0], "checklistItems").slice(0, 20).flatMap(item =>
        typeof item.id === "string" ? [{ type: "taskChecklistItem" as const, id: item.id, label: String(item.title ?? "").slice(0, 300) }] : []);
    } else {
      recentEntities = taskEntities;
    }
  }
  if (toolName === "getSchedule") {
    recentEntities = recordArray(output, "items").slice(0, 20).flatMap((item) =>
      typeof item.id === "string"
        ? [{ type: "schedule" as const, id: item.id, ...(typeof item.title === "string" ? { label: item.title } : {}) }]
        : [],
    );
  } else if (toolName === "searchNotes") {
    recentEntities = recordArray(output, "notes").slice(0, 20).flatMap((item) =>
      typeof item.id === "string"
        ? [{ type: "note" as const, id: item.id, ...(typeof item.title === "string" ? { label: item.title } : {}) }]
        : [],
    );
  } else if (toolName === "searchVaultMetadata") {
    recentEntities = recordArray(output, "records").slice(0, 20).flatMap((item) =>
      typeof item.id === "string"
        ? [{ type: "vault" as const, id: item.id, ...(typeof item.serviceName === "string" ? { label: item.serviceName } : {}) }]
        : [],
    );
  }

  const outputRecord = output && typeof output === "object" && !Array.isArray(output)
    ? output as Record<string, unknown>
    : {};
  const confirmation = outputRecord.confirmation && typeof outputRecord.confirmation === "object"
    ? outputRecord.confirmation as Record<string, unknown>
    : null;
  const pendingActionId = typeof confirmation?.id === "string"
    ? confirmation.id
    : previous?.pendingActionId;
  return conversationStateSchema.parse({
    ...previous,
    activeIntent: tool.intent,
    activeDomain: tool.domain,
    activeTool: toolName,
    ...(recentEntities ? { recentEntities } : {}),
    ...(referencedEntity ? { referencedEntity } : recentEntities?.length === 1 ? { referencedEntity: recentEntities[0] } : {}),
    ...(pendingActionId ? { pendingActionId } : {}),
    updatedAt: new Date().toISOString(),
  });
}
