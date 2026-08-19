import { deleteOrCancelRoutine, deleteScheduleItem, updateScheduleItem, updateScheduleStatus } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { scheduleDeleteSchema, scheduleUpdateSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = await parseJson(request, scheduleUpdateSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  if (body.status && Object.keys(body).length === 1) {
    return Response.json({ item: await updateScheduleStatus(id, body.status) });
  }
  return Response.json({ item: await updateScheduleItem(id, {
    ...body,
    startTime: body.startTime === null ? null : body.startTime ? new Date(body.startTime) : undefined,
    endTime: body.endTime === null ? null : body.endTime ? new Date(body.endTime) : undefined,
    recurrenceRule: body.recurrenceRule === null ? null : body.recurrenceRule ? (typeof body.recurrenceRule === "string" ? body.recurrenceRule : JSON.stringify(body.recurrenceRule)) : undefined,
    routineEndDate: body.routineEndDate === null ? null : body.routineEndDate ? new Date(body.routineEndDate) : undefined,
  }) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = await parseJson(request, scheduleDeleteSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  if (body.mode === "DELETE") await deleteScheduleItem(id);
  else await deleteOrCancelRoutine(id, body.scope ?? "ALL", body.instanceStartTime ? new Date(body.instanceStartTime) : undefined);
  return new Response(null, { status: 204 });
}
