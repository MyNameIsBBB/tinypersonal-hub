import { createScheduleItem, deleteOrCancelRoutine, recordAudit, resolvePendingAction, updateNote, updateScheduleItem, updateScheduleStatus, updateVaultMetadata } from "@tinypersonal/backend-api";
import { z } from "zod";
import { authorizedOwnerKey } from "@/lib/serverAuth";
import { parseJson } from "@/lib/apiValidation";

const decisionSchema = z.object({ approved: z.boolean() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerKey = authorizedOwnerKey(request); if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, decisionSchema); if ("response" in parsed) return parsed.response;
  const { id } = await context.params;
  const action = await resolvePendingAction(ownerKey, id, parsed.data.approved);
  if (!action) return Response.json({ error: "Confirmation not found or expired" }, { status: 404 });
  if (!parsed.data.approved) { await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "DENIED" }); return Response.json({ ok: true, denied: true }); }
  try {
    const args = JSON.parse(action.argumentsJson) as Record<string, unknown>;
    let result: unknown;
    if (action.toolName === "schedule.create") result = await createScheduleItem(args as Parameters<typeof createScheduleItem>[0]);
    else if (action.toolName === "schedule.updateStatus") result = await updateScheduleStatus(String(args.id), args.status as Parameters<typeof updateScheduleStatus>[1]);
    else if (action.toolName === "schedule.updateRoutine") {
      const { id: routineId, startTime, endTime, routineEndDate, ...input } = args;
      result = await updateScheduleItem(String(routineId), {
        ...input,
        ...(typeof startTime === "string" ? { startTime: new Date(startTime) } : {}),
        ...(typeof endTime === "string" ? { endTime: new Date(endTime) } : {}),
        ...(typeof routineEndDate === "string" ? { routineEndDate: new Date(routineEndDate) } : {}),
      });
    }
    else if (action.toolName === "schedule.deleteRoutine") { await deleteOrCancelRoutine(String(args.id), "ALL"); result = { id: String(args.id), status: "CANCELLED" }; }
    else if (action.toolName === "notes.update") { const { id: targetId, ...input } = args; result = await updateNote(String(targetId), input); }
    else if (action.toolName === "vault.updateMetadata") { const { id: targetId, ...input } = args; result = await updateVaultMetadata(String(targetId), input); }
    else return Response.json({ error: "Unsupported pending action" }, { status: 400 });
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "SUCCEEDED" });
    return Response.json({ ok: true, result });
  } catch (error) {
    await recordAudit({ actorId: ownerKey, action: action.toolName, targetId: id, status: "FAILED", metadata: { error: error instanceof Error ? error.message : "Unknown error" } });
    return Response.json({ error: error instanceof Error ? error.message : "Execution failed" }, { status: 400 });
  }
}
