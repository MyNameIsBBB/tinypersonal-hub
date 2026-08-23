import { createScheduleItem, getScheduleByRange, listActiveRoutines } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { scheduleCreateSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const rangeStart = new Date(url.searchParams.get("start") ?? new Date().toISOString());
  const rangeEnd = new Date(url.searchParams.get("end") ?? new Date(Date.now() + 31 * 86_400_000).toISOString());
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return Response.json({ error: "Invalid date range" }, { status: 400 });
  const [items, routines] = await Promise.all([getScheduleByRange(rangeStart, rangeEnd), listActiveRoutines()]);
  return Response.json({ items, routines }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, scheduleCreateSchema); if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  try {
    const item = await createScheduleItem({
      title: input.title.trim(), description: input.description ?? null, type: input.type,
      startTime: input.startTime ? new Date(input.startTime) : null,
      endTime: input.endTime ? new Date(input.endTime) : null,
      isAllDay: input.isAllDay ?? false, status: "PENDING", priority: input.priority ?? "MEDIUM",
      recurrenceRule: input.recurrenceRule ? (typeof input.recurrenceRule === "string" ? input.recurrenceRule : JSON.stringify(input.recurrenceRule)) : null,
      routineEndDate: input.routineEndDate ? new Date(input.routineEndDate) : null,
      parentRoutineId: null,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Create failed" }, { status: 400 });
  }
}
