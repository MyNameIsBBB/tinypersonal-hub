import { prisma } from "../db/client";
import { createNote, deleteNote, updateNote } from "./noteService";
import { createScheduleItem, deleteOrCancelRoutine, updateScheduleItem, updateScheduleStatus } from "./scheduleService";
import { createVaultSecret, deleteVaultSecret, updateVaultMetadata } from "./vaultService";
import { decryptSecret, encryptSecret } from "../security/vaultCrypto";
import { enqueueCodingJob } from "./codingJobService";

function safeMetadata(metadata: Record<string, unknown>): string {
  const sanitized = Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    !/(password|secret|token|otp|cipher|authorization)/i.test(key)));
  return JSON.stringify(sanitized).slice(0, 20_000);
}

export function assertSuccessfulToolResult(result: unknown): void {
  if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== false) return;
  const error = "error" in result && result.error && typeof result.error === "object" ? result.error : null;
  const message = error && "message" in error && typeof error.message === "string"
    ? error.message
    : "The operation did not complete successfully";
  throw new Error(message);
}

export async function recordAudit(input: {
  actorId: string; action: string; status: "REQUESTED" | "SUCCEEDED" | "FAILED" | "DENIED";
  targetType?: string; targetId?: string; promptVersion?: string; metadata?: Record<string, unknown>;
}) {
  const { metadata, ...data } = input;
  return prisma.auditLog.create({ data: { ...data, metadataJson: safeMetadata(metadata ?? {}) } });
}

export async function createPendingAction(input: {
  ownerKey: string; sessionId?: string; toolName: string; arguments: unknown; summary: string; sensitive?: boolean;
}) {
  const id = crypto.randomUUID();
  const argumentsJson = input.sensitive
    ? JSON.stringify({ sealed: encryptSecret(JSON.stringify(input.arguments), `pending:${id}`) })
    : JSON.stringify(input.arguments);
  const action = await prisma.pendingAction.create({ data: {
    id,
    ownerKey: input.ownerKey, sessionId: input.sessionId, toolName: input.toolName,
    argumentsJson, summary: input.summary.slice(0, 500),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  } });
  await recordAudit({ actorId: input.ownerKey, action: input.toolName, targetType: "PendingAction", targetId: action.id, status: "REQUESTED", metadata: { summary: input.summary, sessionId: input.sessionId } });
  return action;
}

export async function resolvePendingAction(ownerKey: string, id: string, approved: boolean) {
  const resolvedAt = new Date();
  const claimed = await prisma.pendingAction.updateMany({
    where: { id, ownerKey, status: "PENDING", expiresAt: { gt: resolvedAt } },
    data: { status: approved ? "APPROVED" : "DENIED", resolvedAt },
  });
  if (claimed.count !== 1) return null;
  return prisma.pendingAction.findUnique({ where: { id } });
}

export async function executePendingAction(ownerKey: string, id: string, approved: boolean) {
  const action = await resolvePendingAction(ownerKey, id, approved);
  if (!action) return null;
  if (!approved) {
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "DENIED" });
    return { action, denied: true, result: null };
  }

  try {
    const storedArgs = JSON.parse(action.argumentsJson) as Record<string, unknown>;
    const sealed = storedArgs.sealed;
    const args = sealed && typeof sealed === "object"
      ? JSON.parse(decryptSecret(sealed as { ciphertext: string; iv: string; authTag: string }, `pending:${action.id}`)) as Record<string, unknown>
      : storedArgs;
    let result: unknown;
    if (action.toolName === "schedule.create") result = await createScheduleItem(args as Parameters<typeof createScheduleItem>[0]);
    else if (action.toolName === "schedule.updateStatus") result = await updateScheduleStatus(String(args.id), args.status as Parameters<typeof updateScheduleStatus>[1]);
    else if (action.toolName === "schedule.update") {
      const { id: routineId, startTime, endTime, routineEndDate, ...input } = args;
      result = await updateScheduleItem(String(routineId), {
        ...input,
        ...(typeof startTime === "string" ? { startTime: new Date(startTime) } : {}),
        ...(typeof endTime === "string" ? { endTime: new Date(endTime) } : {}),
        ...(typeof routineEndDate === "string" ? { routineEndDate: new Date(routineEndDate) } : {}),
      });
    }
    else if (action.toolName === "schedule.deleteRoutine") { await deleteOrCancelRoutine(String(args.id), "ALL"); result = { id: String(args.id), status: "CANCELLED" }; }
    else if (action.toolName === "notes.create") result = await createNote(args as Parameters<typeof createNote>[0]);
    else if (action.toolName === "notes.update") { const { id: targetId, ...input } = args; result = await updateNote(String(targetId), input); }
    else if (action.toolName === "notes.delete") { await deleteNote(String(args.id)); result = { id: String(args.id), deleted: true }; }
    else if (action.toolName === "vault.create") result = await createVaultSecret(args as Parameters<typeof createVaultSecret>[0]);
    else if (action.toolName === "vault.updateMetadata") { const { id: targetId, ...input } = args; result = await updateVaultMetadata(String(targetId), input); }
    else if (action.toolName === "vault.delete") { await deleteVaultSecret(String(args.id)); result = { id: String(args.id), deleted: true }; }
    else if (action.toolName === "coding.delegateTask") {
      if (!action.sessionId) throw new Error("Coding task is missing a chat session");
      const latestUser = await prisma.chatMessage.findFirst({ where: { sessionId: action.sessionId, role: "user" }, orderBy: { createdAt: "desc" }, select: { messageId: true } });
      if (!latestUser) throw new Error("Coding task is missing its user message");
      result = await enqueueCodingJob({ ownerKey, sessionId: action.sessionId, userMessageId: latestUser.messageId, task: args });
    }
    else throw new Error("Unsupported pending action");
    assertSuccessfulToolResult(result);
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "SUCCEEDED" });
    return { action, denied: false, result };
  } catch (error) {
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "FAILED", metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
    throw error;
  }
}

export async function executeAllPendingActions(ownerKey: string, sessionId: string, approved: boolean) {
  const actions = await prisma.pendingAction.findMany({
    where: { ownerKey, sessionId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (actions.length === 0) return [];
  const results = [];
  for (const { id } of actions) {
    const res = await executePendingAction(ownerKey, id, approved);
    if (res) results.push(res);
  }
  return results;
}

/** A new non-confirmation request replaces proposals left pending in this chat. */
export async function supersedePendingActions(ownerKey: string, sessionId: string) {
  return prisma.pendingAction.updateMany({
    where: { ownerKey, sessionId, status: "PENDING" },
    data: { status: "DENIED", resolvedAt: new Date() },
  });
}

export async function executeLatestPendingAction(ownerKey: string, sessionId: string, approved: boolean) {
  const action = await prisma.pendingAction.findFirst({
    where: { ownerKey, sessionId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return action ? executePendingAction(ownerKey, action.id, approved) : null;
}
