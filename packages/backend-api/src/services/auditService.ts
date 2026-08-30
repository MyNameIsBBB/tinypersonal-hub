import { prisma } from "../db/client";
import { createNote, deleteNote, updateNote } from "./noteService";
import { deleteMediaAsset, updateMediaAssetLinks } from "./mediaService";
import { createScheduleItem, deleteOrCancelRoutine, updateScheduleItem, updateScheduleStatus } from "./scheduleService";
import { deleteVaultSecret, updateVaultMetadata } from "./vaultService";
import { controlSmartHomeDevice, delegateCodingTask } from "./jarvisService";

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
  ownerKey: string; sessionId?: string; toolName: string; arguments: unknown; summary: string;
}) {
  const action = await prisma.pendingAction.create({ data: {
    ownerKey: input.ownerKey, sessionId: input.sessionId, toolName: input.toolName,
    argumentsJson: JSON.stringify(input.arguments), summary: input.summary.slice(0, 500),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  } });
  await recordAudit({ actorId: input.ownerKey, action: input.toolName, targetType: "PendingAction", targetId: action.id, status: "REQUESTED", metadata: { summary: input.summary, sessionId: input.sessionId } });
  return action;
}

export async function resolvePendingAction(ownerKey: string, id: string, approved: boolean) {
  const action = await prisma.pendingAction.findFirst({ where: { id, ownerKey, status: "PENDING", expiresAt: { gt: new Date() } } });
  if (!action) return null;
  return prisma.pendingAction.update({ where: { id }, data: { status: approved ? "APPROVED" : "DENIED", resolvedAt: new Date() } });
}

export async function executePendingAction(ownerKey: string, id: string, approved: boolean) {
  const action = await resolvePendingAction(ownerKey, id, approved);
  if (!action) return null;
  if (!approved) {
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "DENIED" });
    return { action, denied: true, result: null };
  }

  try {
    const args = JSON.parse(action.argumentsJson) as Record<string, unknown>;
    let result: unknown;
    if (action.toolName === "schedule.create") result = await createScheduleItem(args as Parameters<typeof createScheduleItem>[0]);
    else if (action.toolName === "schedule.updateStatus") result = await updateScheduleStatus(String(args.id), args.status as Parameters<typeof updateScheduleStatus>[1]);
    else if (action.toolName === "schedule.updateRoutine") {
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
    else if (action.toolName === "media.updateLinks") { const { id: targetId, ...input } = args; result = await updateMediaAssetLinks(String(targetId), input); }
    else if (action.toolName === "media.delete") { await deleteMediaAsset(String(args.id)); result = { id: String(args.id), deleted: true }; }
    else if (action.toolName === "vault.updateMetadata") { const { id: targetId, ...input } = args; result = await updateVaultMetadata(String(targetId), input); }
    else if (action.toolName === "vault.delete") { await deleteVaultSecret(String(args.id)); result = { id: String(args.id), deleted: true }; }
    else if (action.toolName === "coding.delegateTask") result = await delegateCodingTask(args);
    else if (action.toolName === "homeAssistant.callService") result = await controlSmartHomeDevice(args);
    else throw new Error("Unsupported pending action");
    assertSuccessfulToolResult(result);
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "SUCCEEDED" });
    return { action, denied: false, result };
  } catch (error) {
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "FAILED", metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
    throw error;
  }
}

export async function executeLatestPendingAction(ownerKey: string, sessionId: string, approved: boolean) {
  const action = await prisma.pendingAction.findFirst({
    where: { ownerKey, sessionId, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return action ? executePendingAction(ownerKey, action.id, approved) : null;
}
