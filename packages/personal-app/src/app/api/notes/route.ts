import { createNote, searchNotes } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ notes: await searchNotes(query) });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json() as {
    title?: string; content?: string; tags?: string[]; folder?: string; scheduleItemId?: string;
  };
  if (!input.title?.trim() || typeof input.content !== "string") {
    return Response.json({ error: "title and content are required" }, { status: 400 });
  }
  return Response.json({ note: await createNote({
    title: input.title, content: input.content, tags: input.tags,
    folder: input.folder, scheduleItemId: input.scheduleItemId,
  }) }, { status: 201 });
}
