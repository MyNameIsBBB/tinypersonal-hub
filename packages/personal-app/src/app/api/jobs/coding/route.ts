import { claimCodingJob, completeCodingJob, delegateCodingTask, getLatestCodingJob, saveChatMessage, sendWebPushNotification, updateCodingJobProgress } from "@tinypersonal/backend-api";
import { authorizedOwnerKey, isCronAuthorizedRequest } from "@/lib/serverAuth";

export const maxDuration = 1800;

function codexSummary(logs: Array<{ command: string; stdout: string; stderr: string }>) {
  const log = [...logs].reverse().find((entry) => entry.command.includes("codex") && entry.command.includes("exec"));
  if (!log) return "Codex completed without a textual summary";
  let summary = "";
  for (const line of log.stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) summary = event.item.text;
    } catch {}
  }
  return (summary || log.stderr || "Codex completed without a textual summary").trim().slice(-12_000);
}

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!ownerKey || !sessionId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ job: await getLatestCodingJob(ownerKey, sessionId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isCronAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const job = await claimCodingJob();
  if (!job) return new Response(null, { status: 204 });
  let ok = false;
  let responseText: string;
  let result: Awaited<ReturnType<typeof delegateCodingTask>> | undefined;
  try {
    result = await delegateCodingTask(JSON.parse(job.inputJson), (progress) => {
      void updateCodingJobProgress(job.id, progress);
    });
    ok = result.ok;
    if (result.ok) {
      const summary = codexSummary(result.data.logs);
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
