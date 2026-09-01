import { prisma } from "../db/client";
import type { StoredChatMessage } from "./chatService";

const MAX_ATTEMPTS = 3;
const MAX_ERROR_LENGTH = 4_000;
const DEFAULT_LEASE_MINUTES = 12;

type EnqueueInput = {
  ownerKey: string;
  sessionId: string;
  userMessageId: string;
  request: unknown;
};

function pendingAssistantMessage(jobId: string): StoredChatMessage {
  return {
    id: `chat-job-${jobId}`,
    role: "assistant",
    parts: [{ type: "text", text: "" }],
  };
}

function messageText(message: StoredChatMessage) {
  return message.parts.flatMap((part) =>
    typeof part === "object" && part && "text" in part
      ? [String((part as { text: unknown }).text)]
      : [],
  ).join(" ").trim();
}

export async function saveUserMessageAndEnqueueChatGeneration(input: {
  ownerKey: string;
  sessionId: string;
  message: StoredChatMessage;
  request: unknown;
}) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.chatSession.findFirstOrThrow({
      where: { id: input.sessionId, ownerKey: input.ownerKey },
    });
    await tx.chatMessage.upsert({
      where: { sessionId_messageId: { sessionId: input.sessionId, messageId: input.message.id } },
      create: { sessionId: input.sessionId, messageId: input.message.id, role: "user", payloadJson: JSON.stringify(input.message) },
      update: { role: "user", payloadJson: JSON.stringify(input.message) },
    });
    let job = await tx.chatGenerationJob.findUnique({
      where: { sessionId_userMessageId: { sessionId: input.sessionId, userMessageId: input.message.id } },
    });
    if (!job) {
      job = await tx.chatGenerationJob.create({ data: {
        ownerKey: input.ownerKey,
        sessionId: input.sessionId,
        userMessageId: input.message.id,
        inputJson: JSON.stringify(input.request),
      } });
      const placeholder = pendingAssistantMessage(job.id);
      await tx.chatMessage.create({ data: {
        sessionId: input.sessionId,
        messageId: placeholder.id,
        role: "assistant_pending",
        payloadJson: JSON.stringify(placeholder),
      } });
    }
    await tx.chatSession.update({
      where: { id: input.sessionId },
      data: {
        title: session.title || messageText(input.message).slice(0, 120) || null,
        updatedAt: new Date(),
      },
    });
    return job;
  });
}

export async function enqueueChatGenerationJob(input: EnqueueInput) {
  return prisma.$transaction(async (tx) => {
    const uniqueJob = {
      sessionId_userMessageId: {
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
      },
    };
    const existing = await tx.chatGenerationJob.findUnique({ where: uniqueJob });
    if (existing) return existing;
    const job = await tx.chatGenerationJob.create({
      data: {
        ownerKey: input.ownerKey,
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
        inputJson: JSON.stringify(input.request),
      },
    });
    const message = pendingAssistantMessage(job.id);
    await tx.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        messageId: message.id,
        role: "assistant_pending",
        payloadJson: JSON.stringify(message),
      },
    });
    await tx.chatSession.update({
      where: { id: input.sessionId },
      data: { updatedAt: new Date() },
    });
    return job;
  });
}

export async function claimChatGenerationJob(leaseMinutes = DEFAULT_LEASE_MINUTES) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiredLease = { status: "RUNNING", leaseUntil: { lt: now } };
    await tx.chatGenerationJob.updateMany({
      where: { ...expiredLease, attempts: { lt: MAX_ATTEMPTS } },
      data: { status: "QUEUED", leaseUntil: null },
    });
    await tx.chatGenerationJob.updateMany({
      where: { ...expiredLease, attempts: { gte: MAX_ATTEMPTS } },
      data: {
        status: "FAILED",
        error: `Generation lease expired after ${MAX_ATTEMPTS} attempts`,
        completedAt: now,
        leaseUntil: null,
      },
    });
    const next = await tx.chatGenerationJob.findFirst({
      where: { status: "QUEUED", attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;
    const claimed = await tx.chatGenerationJob.updateMany({
      where: { id: next.id, status: "QUEUED" },
      data: {
        status: "RUNNING",
        attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + leaseMinutes * 60_000),
        error: null,
      },
    });
    if (claimed.count !== 1) return null;
    return tx.chatGenerationJob.findUnique({ where: { id: next.id } });
  });
}

export async function completeChatGenerationJob(id: string, outcome: { ok: boolean; error?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.chatGenerationJob.findUniqueOrThrow({ where: { id } });
    const retry = !outcome.ok && current.attempts < MAX_ATTEMPTS;
    const error = outcome.error?.slice(0, MAX_ERROR_LENGTH);
    return tx.chatGenerationJob.update({
      where: { id },
      data: retry
        ? { status: "QUEUED", error, leaseUntil: null }
        : {
            status: outcome.ok ? "SUCCEEDED" : "FAILED",
            error,
            leaseUntil: null,
            completedAt: new Date(),
          },
    });
  });
}

export async function getLatestChatGenerationJob(ownerKey: string, sessionId: string) {
  return prisma.chatGenerationJob.findFirst({
    where: { ownerKey, sessionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, userMessageId: true, status: true, attempts: true, error: true, createdAt: true, updatedAt: true, completedAt: true },
  });
}
