import { sendDueScheduleNotifications } from "@tinypersonal/backend-api";
import { timingSafeEqual } from "node:crypto";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected); const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const leadMinutes = Number(process.env.SCHEDULE_NOTIFICATION_LEAD_MINUTES ?? 15);
  const deliveries = await sendDueScheduleNotifications(new Date(), Number.isFinite(leadMinutes) ? Math.min(Math.max(Math.round(leadMinutes), 1), 1440) : 15);
  return Response.json({ ok: true, deliveries });
}
