import { deleteOrCancelRoutine, deleteScheduleItem, updateScheduleItem, updateScheduleStatus } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.status === "string" && Object.keys(body).length === 1) {
    return Response.json({ item: await updateScheduleStatus(id, body.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") });
  }
  return Response.json({ item: await updateScheduleItem(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    description: body.description === null || typeof body.description === "string" ? body.description : undefined,
    type: typeof body.type === "string" ? body.type as "EVENT" | "TASK" | "ROUTINE" : undefined,
    startTime: body.startTime === null ? null : typeof body.startTime === "string" ? new Date(body.startTime) : undefined,
    endTime: body.endTime === null ? null : typeof body.endTime === "string" ? new Date(body.endTime) : undefined,
    isAllDay: typeof body.isAllDay === "boolean" ? body.isAllDay : undefined,
    status: typeof body.status === "string" ? body.status as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" : undefined,
    priority: typeof body.priority === "string" ? body.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT" : undefined,
    recurrenceRule: body.recurrenceRule === null ? null : body.recurrenceRule ? JSON.stringify(body.recurrenceRule) : undefined,
    routineEndDate: body.routineEndDate === null ? null : typeof body.routineEndDate === "string" ? new Date(body.routineEndDate) : undefined,
  }) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { mode?: "DELETE" | "CANCEL"; scope?: "ALL" | "INSTANCE"; instanceStartTime?: string };
  if (body.mode === "DELETE") await deleteScheduleItem(id);
  else await deleteOrCancelRoutine(id, body.scope ?? "ALL", body.instanceStartTime ? new Date(body.instanceStartTime) : undefined);
  return new Response(null, { status: 204 });
}
