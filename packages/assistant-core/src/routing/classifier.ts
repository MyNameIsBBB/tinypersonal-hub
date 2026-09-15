import { z } from "zod";
import type { AgentIntent, ToolScope } from "./toolScoper";
import { taskScope } from "./taskRouting";

export const classifierDecisionSchema = z.object({
  domain: z.enum(["general", "coding", "schedule", "notes", "vault", "web", "memory", "task"]),
  action: z.enum(["respond", "query", "create", "update", "remove"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(240),
}).strict().superRefine(({ domain, action }, context) => {
  const allowedActions: Record<typeof domain, Array<typeof action>> = {
    general: ["respond"],
    task: ["query", "create", "update", "remove"],
    coding: ["respond"],
    schedule: ["query", "create", "update", "remove"],
    notes: ["query", "create", "update", "remove"],
    vault: ["query", "create", "update", "remove"],
    web: ["query"],
    memory: ["query"],
  };
  if (!allowedActions[domain].includes(action)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["action"],
      message: `Action ${action} is invalid for domain ${domain}`,
    });
  }
});

export type ClassifierDecision = z.infer<typeof classifierDecisionSchema>;

export function scopeFromClassification(decision: ClassifierDecision, message: string): ToolScope {
  const { domain, action } = decision;
  if (domain === "task" && (action === "query" || action === "create" || action === "update" || action === "remove")) {
    return { ...taskScope(action, /checklist|เช็กลิสต์/iu.test(message) && action !== "create"), confidence: decision.confidence };
  }
  let intent: AgentIntent = "general.response";
  let allowedTools: ToolScope["allowedTools"] = [];
  if (domain === "schedule") {
    intent = action === "query" ? "schedule.query" : "schedule.mutate";
    allowedTools = action === "create"
      ? ["getSchedule", "createScheduleItem"]
      : action === "update"
        ? ["getSchedule", "updateTaskStatus", "updateScheduleItem"]
        : action === "remove"
          ? ["getSchedule", "updateTaskStatus", "deleteRoutine"]
          : ["getSchedule"];
  } else if (domain === "notes") {
    intent = action === "query" ? "notes.query" : "notes.mutate";
    allowedTools = action === "create"
      ? ["searchNotes", "createNote"]
      : action === "update"
        ? ["searchNotes", "updateNote"]
        : action === "remove"
          ? ["searchNotes", "deleteNote"]
          : ["searchNotes"];
  } else if (domain === "vault") {
    intent = action === "query" ? "vault.query" : "vault.mutate";
    allowedTools = action === "create"
      ? ["searchVaultMetadata", "createVaultSecret"]
      : action === "update"
        ? ["searchVaultMetadata", "updateVaultMetadata"]
        : action === "remove"
          ? ["searchVaultMetadata", "deleteVaultSecret"]
          : ["searchVaultMetadata"];
  } else if (domain === "web") {
    intent = "web.query";
    allowedTools = /https?:\/\//iu.test(message) ? ["fetchWebPage"] : ["searchWeb"];
  } else if (domain === "coding") {
    intent = "coding.response";
    allowedTools = [];
  } else if (domain === "memory") {
    intent = "memory.query";
  }
  return {
    primaryIntent: intent,
    intents: [intent],
    allowedTools,
    confidence: Math.min(decision.confidence, 0.99),
    matchedDomains: domain === "general" ? [] : [domain],
  };
}
