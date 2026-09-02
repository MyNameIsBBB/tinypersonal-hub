import { claimChatGenerationJob, completeChatGenerationJob, getLatestChatGenerationJob, saveChatMessage, sendWebPushNotification } from "@tinypersonal/backend-api";
import { authorizedOwnerKey, isCronAuthorizedRequest } from "@/lib/serverAuth";

export const maxDuration = 600;

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
  try {
    const storedRequest = JSON.parse(job.inputJson) as Record<string, unknown>;
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
  } else {
    await sendWebPushNotification("TinyPersonal ตอบแล้ว", "แตะเพื่อเปิดคำตอบในแชท", `/ai?sessionId=${encodeURIComponent(job.sessionId)}`, job.ownerKey);
  }
  return Response.json({ ok, jobId: job.id });
}
