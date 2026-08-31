import { prisma } from "../db/client";
import { getScheduleByRange } from "./scheduleService";

export type StoredChatMessage = { id: string; role: string; parts: unknown[] };
export const GENERAL_CHAT_TITLE = "แชททั่วไป";

function bangkokCycleDate(now: Date): string {
    // 08:00 Asia/Bangkok is 01:00 UTC, so shifting UTC back one hour gives the cycle date.
    return new Date(now.getTime() - 3_600_000).toISOString().slice(0, 10);
}

function morningMessageId(cycleDate: string): string {
    return `morning-${cycleDate}`;
}

async function deterministicMorningBriefing(
    cycleDate: string,
): Promise<string> {
    const start = new Date(`${cycleDate}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86_400_000 - 1);
    const schedule = await getScheduleByRange(start, end);
    if (!schedule.length)
        return `สวัสดีตอนเช้าครับ วันนี้ (${cycleDate}) ตารางยังว่าง ไม่มีนัดหมายหรืองานที่บันทึกไว้ครับ`;
    const lines = schedule.slice(0, 12).map((item) => {
        const time =
            item.startTime?.toLocaleTimeString("th-TH", {
                timeZone: "Asia/Bangkok",
                hour: "2-digit",
                minute: "2-digit",
            }) ?? "ไม่ระบุเวลา";
        return `• ${time} ${item.title}`;
    });
    return `สวัสดีตอนเช้าครับ ตารางวันนี้ (${cycleDate}) มี ${schedule.length} รายการ:\n${lines.join("\n")}`;
}

async function resetGeneralSession(
    sessionId: string,
    cycleDate: string,
    message: string,
    replaceExisting = false,
): Promise<void> {
    const id = morningMessageId(cycleDate);
    const existing = await prisma.chatMessage.findUnique({
        where: { sessionId_messageId: { sessionId, messageId: id } },
        select: { id: true },
    });
    if (existing && !replaceExisting) return;
    const payload: StoredChatMessage = {
        id,
        role: "assistant",
        parts: [{ type: "text", text: message }],
    };
    await prisma.$transaction([
        prisma.chatMessage.deleteMany({
            where: { sessionId, messageId: { not: id } },
        }),
        prisma.chatMessage.upsert({
            where: { sessionId_messageId: { sessionId, messageId: id } },
            create: {
                sessionId,
                messageId: id,
                role: "assistant",
                payloadJson: JSON.stringify(payload),
            },
            update: { role: "assistant", payloadJson: JSON.stringify(payload) },
        }),
        prisma.chatSession.update({
            where: { id: sessionId },
            data: { title: GENERAL_CHAT_TITLE },
        }),
    ]);
}

export async function ensureDailyGeneralChat(
    ownerKey: string,
    _now = new Date(),
) {
    let session = await prisma.chatSession.findFirst({
        where: { ownerKey, title: GENERAL_CHAT_TITLE },
        orderBy: { createdAt: "asc" },
    });
    session ??= await prisma.chatSession.create({
        data: { ownerKey, title: GENERAL_CHAT_TITLE },
    });
    return session;
}

export async function resetAllGeneralChats(
    message: string,
    cycleDate: string,
): Promise<number> {
    const sessions = await prisma.chatSession.findMany({
        where: { title: GENERAL_CHAT_TITLE },
        select: { id: true },
    });
    await Promise.all(
        sessions.map(({ id }) =>
            resetGeneralSession(id, cycleDate, message, true),
        ),
    );
    return sessions.length;
}

export async function listChatSessions(ownerKey: string, limit = 30) {
    return prisma.chatSession.findMany({
        where: { ownerKey },
        orderBy: { updatedAt: "desc" },
        take: Math.min(Math.max(limit, 1), 100),
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { messages: true } },
            messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { messageId: true, role: true, createdAt: true },
            },
        },
    });
}

export async function createChatSession(ownerKey: string) {
    return prisma.chatSession.create({
        data: { ownerKey },
        select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
}

export async function getOrCreateChatSession(
    ownerKey: string,
    sessionId?: string,
) {
    if (sessionId) {
        const existing = await prisma.chatSession.findFirst({
            where: { id: sessionId, ownerKey },
        });
        if (existing) return existing;
    }
    const latest = await prisma.chatSession.findFirst({
        where: { ownerKey },
        orderBy: { updatedAt: "desc" },
    });
    if (latest) return latest;
    return prisma.chatSession.create({ data: { ownerKey } });
}

export async function loadChatMessages(
    ownerKey: string,
    sessionId: string,
): Promise<StoredChatMessage[]> {
    const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, ownerKey },
        select: { id: true },
    });
    if (!session) return [];
    const rows = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
        take: 120,
    });
    return rows.map((row) => JSON.parse(row.payloadJson) as StoredChatMessage);
}

export async function saveChatMessage(
    ownerKey: string,
    sessionId: string,
    message: StoredChatMessage,
) {
    const session = await prisma.chatSession.findFirstOrThrow({
        where: { id: sessionId, ownerKey },
    });
    const text = message.parts
        .flatMap((part) =>
            typeof part === "object" && part && "text" in part
                ? [String((part as { text: unknown }).text)]
                : [],
        )
        .join(" ")
        .trim();
    const title = session.title === GENERAL_CHAT_TITLE
        ? GENERAL_CHAT_TITLE
        : session.title || (message.role === "user" ? text.slice(0, 120) : null);
    const payloadJson = JSON.stringify(message);

    await prisma.$transaction([
        prisma.chatMessage.upsert({
            where: {
                sessionId_messageId: { sessionId, messageId: message.id },
            },
            create: {
                sessionId,
                messageId: message.id,
                role: message.role,
                payloadJson,
            },
            update: { role: message.role, payloadJson },
        }),
        prisma.chatSession.update({
            where: { id: sessionId },
            data: { title, updatedAt: new Date() },
        }),
    ]);
}

export async function saveUserChatMessage(
    ownerKey: string,
    sessionId: string,
    message: StoredChatMessage,
): Promise<{ removedMessageId: string | null }> {
    await saveChatMessage(ownerKey, sessionId, message);
    return { removedMessageId: null };
}

export async function saveAssistantChatMessageIfCurrent(
    ownerKey: string,
    sessionId: string,
    expectedUserMessageId: string,
    message: StoredChatMessage,
): Promise<boolean> {
    void expectedUserMessageId;
    await saveChatMessage(ownerKey, sessionId, message);
    return true;
}

export async function replaceChatMessages(
    ownerKey: string,
    sessionId: string,
    messages: StoredChatMessage[],
) {
    const session = await prisma.chatSession.findFirstOrThrow({
        where: { id: sessionId, ownerKey },
    });
    const retained = messages.slice(-120);
    const title =
        session.title === GENERAL_CHAT_TITLE
            ? GENERAL_CHAT_TITLE
            : retained
                  .find((message) => message.role === "user")
                  ?.parts?.flatMap((part) =>
                      typeof part === "object" && part && "text" in part
                          ? [String((part as { text: unknown }).text)]
                          : [],
                  )
                  .join(" ")
                  .trim()
                  .slice(0, 120) || session.title;
    await prisma.$transaction([
        prisma.chatMessage.deleteMany({ where: { sessionId } }),
        ...retained.map((message) =>
            prisma.chatMessage.create({
                data: {
                    sessionId,
                    messageId: message.id,
                    role: message.role,
                    payloadJson: JSON.stringify(message),
                },
            }),
        ),
        prisma.chatSession.update({
            where: { id: sessionId },
            data: { title },
        }),
    ]);
}

export async function deleteChatSession(ownerKey: string, sessionId: string) {
    return prisma.chatSession.deleteMany({
        where: { id: sessionId, ownerKey, title: { not: GENERAL_CHAT_TITLE } },
    });
}
