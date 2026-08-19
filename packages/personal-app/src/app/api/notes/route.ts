import { createNote, searchNotes } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { noteCreateSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ notes: await searchNotes(query) });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, noteCreateSchema); if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  return Response.json({ note: await createNote({
    title: input.title, content: input.content, tags: input.tags,
    folder: input.folder, scheduleItemId: input.scheduleItemId,
  }) }, { status: 201 });
}
