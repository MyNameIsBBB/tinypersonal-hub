import { addTaskChecklistItem } from "@tinypersonal/backend-api";
import { taskRequest } from "../../handlers";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return taskRequest(request, async owner => addTaskChecklistItem(owner, { ...await request.json(), taskId: (await context.params).id }), 201);
}

