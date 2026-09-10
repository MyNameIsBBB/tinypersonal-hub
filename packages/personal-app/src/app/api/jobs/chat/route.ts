import { claimChatGenerationJob, completeChatGenerationJob, decodeChatGenerationRequest, getLatestChatGenerationJob, loadChatMessages, saveChatMessage, sendWebPushNotification, type DiscordChatCallback } from "@tinypersonal/backend-api";
import { authorizedOwnerKey, isCronAuthorizedRequest } from "@/lib/serverAuth";

export const maxDuration = 600;

function messageText(parts: unknown[]) {
  return parts.flatMap((part) => part && typeof part === "object" && "text" in part
    ? [String((part as { text: unknown }).text)]
    : []).join("\n").trim();
}

async function completeDiscordResponse(callback: DiscordChatCallback, content: string) {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(callback.applicationId)}/${encodeURIComponent(callback.interactionToken)}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2_000) || "TinyPersonal completed without a text response." }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Discord callback returned HTTP ${response.status}`);
}

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!ownerKey || !sessionId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ job: await getLatestChatGenerationJob(ownerKey, sessionId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isCronAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const job = await claimChatGenerationJob();
  if (!job) return new Response(null, { status: 204 });
  const secret = process.env.CRON_SECRET!;
  const baseUrl = process.env.INTERNAL_APP_URL ?? "http://127.0.0.1:3000";
  let ok = false;
  let errorMessage: string | undefined;
  let callback: DiscordChatCallback | null = null;
  try {
    const decoded = decodeChatGenerationRequest(job.id, job.inputJson);
    const storedRequest = decoded.assistantRequest;
    callback = decoded.callback;
    const response = await fetch(new URL("/api/chat", baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        "X-Chat-Worker": "1",
        "X-Chat-Owner-Key": job.ownerKey,
        "X-Chat-Job-Id": job.id,
        "X-Chat-User-Message-Id": job.userMessageId,
      },
      body: JSON.stringify({ ...storedRequest, sessionId: job.sessionId }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    await response.arrayBuffer();
    ok = response.ok;
    if (!ok) errorMessage = `Internal chat generation returned HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Chat generation failed";
  }
  const completed = await completeChatGenerationJob(job.id, { ok, error: errorMessage });
  if (completed.status === "QUEUED") return Response.json({ ok: false, retrying: true, jobId: job.id });
  if (!ok) {
    const text = `AI ตอบไม่สำเร็จครับ: ${errorMessage ?? "Unknown error"}`;
    await saveChatMessage(job.ownerKey, job.sessionId, { id: `chat-job-${job.id}`, role: "assistant", parts: [{ type: "text", text }] });
    await sendWebPushNotification("TinyPersonal ตอบไม่สำเร็จ", text.slice(0, 180), `/ai?sessionId=${encodeURIComponent(job.sessionId)}`, job.ownerKey);
    if (callback) await completeDiscordResponse(callback, text).catch((error) => console.error("Discord callback failed", error instanceof Error ? error.message : error));
  } else {
    await sendWebPushNotification("TinyPersonal ตอบแล้ว", "แตะเพื่อเปิดคำตอบในแชท", `/ai?sessionId=${encodeURIComponent(job.sessionId)}`, job.ownerKey);
    if (callback) {
      const messages = await loadChatMessages(job.ownerKey, job.sessionId);
      const reply = messages.find(({ id }) => id === `chat-job-${job.id}`);
      await completeDiscordResponse(callback, reply ? messageText(reply.parts) : "TinyPersonal completed without a text response.")
        .catch((error) => console.error("Discord callback failed", error instanceof Error ? error.message : error));
    }
  }
  return Response.json({ ok, jobId: job.id });
}
