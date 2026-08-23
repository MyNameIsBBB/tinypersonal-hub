import { prisma } from "../db/client";

export type StoredChatMessage = { id: string; role: string; parts: unknown[] };

export async function listChatSessions(ownerKey: string, limit = 30) {
  return prisma.chatSession.findMany({
    where: { ownerKey }, orderBy: { updatedAt: "desc" }, take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
  });
}

export async function createChatSession(ownerKey: string) {
  return prisma.chatSession.create({ data: { ownerKey }, select: { id: true, title: true, createdAt: true, updatedAt: true } });
}

export async function getOrCreateChatSession(ownerKey: string, sessionId?: string) {
  if (sessionId) {
    const existing = await prisma.chatSession.findFirst({ where: { id: sessionId, ownerKey } });
    if (existing) return existing;
  }
  const latest = await prisma.chatSession.findFirst({ where: { ownerKey }, orderBy: { updatedAt: "desc" } });
  if (latest) return latest;
  return prisma.chatSession.create({ data: { ownerKey } });
}

export async function loadChatMessages(ownerKey: string, sessionId: string): Promise<StoredChatMessage[]> {
  const session = await prisma.chatSession.findFirst({ where: { id: sessionId, ownerKey }, select: { id: true } });
  if (!session) return [];
  const rows = await prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" }, take: 120 });
  return rows.map((row) => JSON.parse(row.payloadJson) as StoredChatMessage);
}

export async function replaceChatMessages(ownerKey: string, sessionId: string, messages: StoredChatMessage[]) {
  const session = await prisma.chatSession.findFirstOrThrow({ where: { id: sessionId, ownerKey } });
  const retained = messages.slice(-120);
  const title = retained.find((message) => message.role === "user")?.parts
    ?.flatMap((part) => typeof part === "object" && part && "text" in part ? [String((part as { text: unknown }).text)] : [])
    .join(" ").trim().slice(0, 120) || session.title;
  await prisma.$transaction([
    prisma.chatMessage.deleteMany({ where: { sessionId } }),
    ...retained.map((message) => prisma.chatMessage.create({ data: {
      sessionId, messageId: message.id, role: message.role, payloadJson: JSON.stringify(message),
    } })),
    prisma.chatSession.update({ where: { id: sessionId }, data: { title } }),
  ]);
}

export async function deleteChatSession(ownerKey: string, sessionId: string) {
  return prisma.chatSession.deleteMany({ where: { id: sessionId, ownerKey } });
}
