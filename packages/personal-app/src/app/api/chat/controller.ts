import {
  deleteChatSession,
  enqueueChatGenerationJob,
  ensureDailyGeneralChat,
  getLatestCodingJob,
  getOrCreateChatSession,
  listChatSessions,
  loadChatMessages,
} from "@tinypersonal/backend-api";
import { chatRequestSchema } from "@tinypersonal/assistant-core";
import type { UIMessage } from "ai";
import { parseJson } from "@/lib/apiValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { confirmationDecision, latestUserText } from "@/lib/chat/ChatStreamHandler";
import { runChatAgent } from "./agent-runner";
import { handleConfirmation } from "./confirmation-handler";
import { resolveChatOwnerKey, resolveInternalChatWorker } from "./request-context";
import { directTextResponse, queuedTextResponse } from "./response-stream";

function asksForCodingStatus(text: string) {
  return /^(?:(?:codex|งาน\s*(?:codex|โค้ด))\s*(?:เป็นไง(?:บ้าง|แล้ว)?|ถึงไหนแล้ว|status|เสร็จหรือยัง)|(?:ขอดู|ดู|เช็ก)\s*(?:ผล|สถานะ)\s*(?:codex|งานโค้ด))\??$/iu.test(text.trim());
}

function codingStatusText(job: Awaited<ReturnType<typeof getLatestCodingJob>>) {
  if (!job) return "ยังไม่พบงาน Codex ในบทสนทนานี้ครับ";
  let latestProgress = "";
  try {
    const events = JSON.parse(job.progressJson) as Array<{ message?: string }>;
    latestProgress = events.at(-1)?.message ?? "";
  } catch {}
  if (job.status === "QUEUED") return `งาน Codex ยังอยู่ในคิวครับ (ลองแล้ว ${job.attempts} รอบ)`;
  if (job.status === "RUNNING") return `Codex กำลังทำงานครับ${latestProgress ? ` — ${latestProgress}` : ""}`;
  if (job.status === "FAILED") return `งาน Codex ล้มเหลวครับ${job.error ? `: ${job.error}` : ""}`;
  return "Codex ทำงานเสร็จแล้วครับ ผลลัพธ์ถูกบันทึกไว้ในบทสนทนานี้แล้ว";
}

export async function handleGetChat(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const requestedSessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  const generalSession = await ensureDailyGeneralChat(ownerKey);
  const sessions = await listChatSessions(ownerKey);
  const sessionId = requestedSessionId ?? generalSession.id;
  const messages = sessionId ? await loadChatMessages(ownerKey, sessionId) : [];
  return Response.json(
    { sessionId: sessionId ?? null, sessions, messages },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function handleDeleteChat(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });
  const deleted = await deleteChatSession(ownerKey, sessionId);
  if (deleted.count === 0) {
    return Response.json({ error: "General chat cannot be deleted" }, { status: 400 });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function handlePostChat(request: Request) {
  const internalWorker = resolveInternalChatWorker(request);
  const ownerKey = internalWorker?.ownerKey ?? resolveChatOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rateCheck = internalWorker
    ? { success: true }
    : checkRateLimit(`chat:${ownerKey}`, 30, 60_000);
  if (!rateCheck.success) {
    return Response.json(
      { error: "ส่งคำสั่งถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง" },
      { status: 429 },
    );
  }

  const parsed = await parseJson(request, chatRequestSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;
  const generalSession = await ensureDailyGeneralChat(ownerKey);
  const session = await getOrCreateChatSession(ownerKey, payload.sessionId ?? generalSession.id);
  let baseMessages = await loadChatMessages(ownerKey, session.id) as UIMessage[];
  const triggeringUserMessage = internalWorker
    ? baseMessages.find(({ id, role }) => id === internalWorker.userMessageId && role === "user")
    : [...baseMessages].reverse().find(({ role }) => role === "user");
  if (!triggeringUserMessage) {
    return Response.json({ error: "A user message is required" }, { status: 400 });
  }

  if (!internalWorker) {
    const job = await enqueueChatGenerationJob({
      ownerKey,
      sessionId: session.id,
      userMessageId: triggeringUserMessage.id,
      request: { voiceMode: payload.voiceMode, visionContext: payload.visionContext },
    });
    return queuedTextResponse(job.id);
  }

  const triggerIndex = baseMessages.findIndex(({ id }) => id === internalWorker.userMessageId);
  baseMessages = baseMessages.slice(0, triggerIndex + 1);
  const responseMessageId = `chat-job-${internalWorker.jobId}`;
  const decision = confirmationDecision(latestUserText(baseMessages));
  if (decision !== null) {
    return handleConfirmation(
      ownerKey,
      session.id,
      triggeringUserMessage.id,
      decision,
      responseMessageId,
    );
  }

  const userText = latestUserText(baseMessages);
  if (asksForCodingStatus(userText)) {
    const job = await getLatestCodingJob(ownerKey, session.id);
    if (job?.status === "SUCCEEDED") {
      const storedMessages = await loadChatMessages(ownerKey, session.id) as UIMessage[];
      const resultMessage = storedMessages.find(({ id }) => id === `coding-job-${job.id}`);
      const resultText = resultMessage?.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (resultText) {
        return directTextResponse(
          ownerKey,
          session.id,
          triggeringUserMessage.id,
          resultText,
          responseMessageId,
        );
      }
    }
    return directTextResponse(
      ownerKey,
      session.id,
      triggeringUserMessage.id,
      codingStatusText(job),
      responseMessageId,
    );
  }

  return runChatAgent({
    ownerKey,
    sessionId: session.id,
    triggeringUserMessageId: triggeringUserMessage.id,
    responseMessageId,
    userText,
    baseMessages,
    customSystemPrompt: session.customSystemPrompt,
    voiceMode: payload.voiceMode,
    visionContext: payload.visionContext,
  });
}
