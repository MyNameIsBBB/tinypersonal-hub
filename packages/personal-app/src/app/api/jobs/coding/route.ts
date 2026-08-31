import { claimCodingJob, completeCodingJob, delegateCodingTask, saveChatMessage, sendWebPushNotification } from "@tinypersonal/backend-api";
import { timingSafeEqual } from "node:crypto";

export const maxDuration = 1800;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const job = await claimCodingJob();
  if (!job) return new Response(null, { status: 204 });
  let ok = false;
  let responseText: string;
  let result: Awaited<ReturnType<typeof delegateCodingTask>> | undefined;
  try {
    result = await delegateCodingTask(JSON.parse(job.inputJson));
    ok = result.ok;
    if (result.ok) {
      const finalLog = result.data.logs.at(-1);
      const summary = (finalLog?.stdout || finalLog?.stderr || "Codex completed without a textual summary").trim().slice(-12_000);
      responseText = `Codex ทำงานเสร็จแล้วครับ\n\nBranch: ${result.data.branch}\n\n${summary}`;
    } else {
      responseText = `Codex ทำงานไม่สำเร็จครับ: ${result.error.message}`;
    }
  } catch (error) {
    responseText = `Codex worker ขัดข้องครับ: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
  const completed = await completeCodingJob(job.id, { ok, result, ...(!ok && { error: responseText }) });
  if (completed.status === "QUEUED") return Response.json({ ok: false, retrying: true, jobId: job.id });
  await saveChatMessage(job.ownerKey, job.sessionId, { id: `coding-job-${job.id}`, role: "assistant", parts: [{ type: "text", text: responseText }] });
  await sendWebPushNotification(ok ? "Codex ทำงานเสร็จแล้ว" : "งาน Codex มีปัญหา", ok ? "แตะเพื่อเปิดผลลัพธ์ในแชท" : responseText.slice(0, 180), `/ai?sessionId=${encodeURIComponent(job.sessionId)}`, job.ownerKey);
  return Response.json({ ok, jobId: job.id });
}
