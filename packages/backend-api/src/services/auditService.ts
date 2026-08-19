import { prisma } from "../db/client";

function safeMetadata(metadata: Record<string, unknown>): string {
  const sanitized = Object.fromEntries(Object.entries(metadata).filter(([key]) =>
    !/(password|secret|token|otp|cipher|authorization)/i.test(key)));
  return JSON.stringify(sanitized).slice(0, 20_000);
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
