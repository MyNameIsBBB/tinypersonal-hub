import { getTasks, createTask } from "@tinypersonal/backend-api";
import { taskRequest } from "./handlers";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return taskRequest(request, owner => getTasks(owner, {
    query: params.get("q") ?? "", ...(params.get("status") ? { status: params.get("status") } : {}),
    unfinished: params.get("unfinished") === "true",
  }));
}
export async function POST(request: Request) {
  return taskRequest(request, async owner => createTask(owner, await request.json()), 201);
}

