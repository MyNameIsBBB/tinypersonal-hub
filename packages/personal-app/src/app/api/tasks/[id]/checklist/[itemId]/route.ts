import { updateTaskChecklistItem, deleteTaskChecklistItem } from "@tinypersonal/backend-api";
import { taskRequest } from "../../../handlers";
type Context = { params: Promise<{ id: string; itemId: string }> };
export async function PATCH(request: Request, context: Context) {
  return taskRequest(request, async owner => {
    const { id, itemId } = await context.params;
    return updateTaskChecklistItem(owner, { ...await request.json(), taskId: id, id: itemId });
  });
}
export async function DELETE(request: Request, context: Context) {
  return taskRequest(request, async owner => {
    const { id, itemId } = await context.params;
    return deleteTaskChecklistItem(owner, { taskId: id, id: itemId });
  });
}

