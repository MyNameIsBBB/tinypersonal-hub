import { createScheduleItem, getScheduleByRange } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const rangeStart = new Date(url.searchParams.get("start") ?? new Date().toISOString());
  const rangeEnd = new Date(url.searchParams.get("end") ?? new Date(Date.now() + 31 * 86_400_000).toISOString());
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return Response.json({ error: "Invalid date range" }, { status: 400 });
  return Response.json({ items: await getScheduleByRange(rangeStart, rangeEnd) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json() as {
    title?: string; description?: string; type?: "EVENT" | "TASK" | "ROUTINE";
    startTime?: string; endTime?: string; isAllDay?: boolean; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    recurrenceRule?: string; routineEndDate?: string;
  };
  if (!input.title?.trim() || !input.type) return Response.json({ error: "title and type are required" }, { status: 400 });
  try {
    const item = await createScheduleItem({
      title: input.title.trim(), description: input.description ?? null, type: input.type,
      startTime: input.startTime ? new Date(input.startTime) : null,
      endTime: input.endTime ? new Date(input.endTime) : null,
      isAllDay: input.isAllDay ?? false, status: "PENDING", priority: input.priority ?? "MEDIUM",
      recurrenceRule: input.recurrenceRule ?? null,
      routineEndDate: input.routineEndDate ? new Date(input.routineEndDate) : null,
      parentRoutineId: null,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Create failed" }, { status: 400 });
  }
}
