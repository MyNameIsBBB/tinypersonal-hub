import { deleteNote, updateNote } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const input = await request.json() as { title?: string; content?: string; tags?: string[]; folder?: string | null; scheduleItemId?: string | null };
  return Response.json({ note: await updateNote(id, input) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await deleteNote(id);
  return new Response(null, { status: 204 });
}
