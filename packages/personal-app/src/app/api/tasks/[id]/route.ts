import { getTask, updateTask, deleteTask } from "@tinypersonal/backend-api";
import { taskRequest } from "../handlers";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return taskRequest(request, async owner => {
    const task = await getTask(owner, await context.params);
    if (!task) throw new Error("Task not found");
    return task;
  });
}
export async function PATCH(request: Request, context: Context) {
  return taskRequest(request, async owner => updateTask(owner, { ...await request.json(), ...await context.params }));
}
export async function DELETE(request: Request, context: Context) {
  return taskRequest(request, async owner => deleteTask(owner, await context.params));
}

