import { createChatSession, listChatSessions, updateChatSessionSystemPrompt } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";
import { z } from "zod";
import { parseJson } from "@/lib/apiValidation";

const updateSessionSchema = z.object({
  sessionId: z.string().min(1),
  customSystemPrompt: z.string().trim().max(8_000).nullable(),
}).strict();

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ sessions: await listChatSessions(ownerKey) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const session = await createChatSession(ownerKey);
  return Response.json({ session }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, updateSessionSchema);
  if ("response" in parsed) return parsed.response;
  const prompt = parsed.data.customSystemPrompt || null;
  const session = await updateChatSessionSystemPrompt(ownerKey, parsed.data.sessionId, prompt);
  if (!session) return Response.json({ error: "Chat session not found" }, { status: 404 });
  return Response.json({ session }, { headers: { "Cache-Control": "no-store" } });
}
