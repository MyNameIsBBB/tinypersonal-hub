import { sendDueScheduleNotifications } from "@tinypersonal/backend-api";
import { isCronAuthorizedRequest } from "@/lib/serverAuth";

export async function POST(request: Request) {
  if (!isCronAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const leadMinutes = Number(process.env.SCHEDULE_NOTIFICATION_LEAD_MINUTES ?? 15);
  const deliveries = await sendDueScheduleNotifications(new Date(), Number.isFinite(leadMinutes) ? Math.min(Math.max(Math.round(leadMinutes), 1), 1440) : 15);
  return Response.json({ ok: true, deliveries });
}
