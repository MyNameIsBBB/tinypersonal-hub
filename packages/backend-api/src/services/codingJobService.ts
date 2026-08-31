import { prisma } from "../db/client";

export async function enqueueCodingJob(input: { ownerKey: string; sessionId: string; userMessageId: string; task: unknown }) {
  return prisma.codingJob.create({ data: { ownerKey: input.ownerKey, sessionId: input.sessionId, userMessageId: input.userMessageId, inputJson: JSON.stringify(input.task) } });
}

export async function claimCodingJob(leaseMinutes = 35) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.codingJob.updateMany({ where: { status: "RUNNING", leaseUntil: { lt: now }, attempts: { lt: 3 } }, data: { status: "QUEUED", leaseUntil: null } });
    await tx.codingJob.updateMany({ where: { status: "RUNNING", leaseUntil: { lt: now }, attempts: { gte: 3 } }, data: { status: "FAILED", error: "Worker lease expired after 3 attempts", completedAt: now, leaseUntil: null } });
    const next = await tx.codingJob.findFirst({ where: { status: "QUEUED", attempts: { lt: 3 } }, orderBy: { createdAt: "asc" } });
    if (!next) return null;
    const claimed = await tx.codingJob.updateMany({ where: { id: next.id, status: "QUEUED" }, data: { status: "RUNNING", attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + leaseMinutes * 60_000), error: null } });
    return claimed.count === 1 ? tx.codingJob.findUnique({ where: { id: next.id } }) : null;
  });
}

export async function completeCodingJob(id: string, outcome: { ok: boolean; result?: unknown; error?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.codingJob.findUniqueOrThrow({ where: { id } });
    const retry = !outcome.ok && current.attempts < 3;
    return tx.codingJob.update({ where: { id }, data: retry
      ? { status: "QUEUED", error: outcome.error?.slice(0, 4_000), leaseUntil: null }
      : { status: outcome.ok ? "SUCCEEDED" : "FAILED", resultJson: outcome.result === undefined ? null : JSON.stringify(outcome.result), error: outcome.error?.slice(0, 4_000), leaseUntil: null, completedAt: new Date() } });
  });
}
export async function getLatestCodingJob(ownerKey: string, sessionId: string) {
  return prisma.codingJob.findFirst({
    where: { ownerKey, sessionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, attempts: true, createdAt: true, updatedAt: true, completedAt: true, error: true },
  });
}
