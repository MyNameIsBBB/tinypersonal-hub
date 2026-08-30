import { getOrCreateChatSession, saveChatMessage } from "@tinypersonal/backend-api";
import { z } from "zod";
import { parseJson } from "@/lib/apiValidation";
import { authorizedOwnerKey } from "@/lib/serverAuth";

const saveAssistantMessageSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
  message: z.object({
    id: z.string().trim().min(1).max(191),
    role: z.literal("assistant"),
    parts: z.array(z.unknown()).min(1).max(24),
  }).strict(),
}).strict();

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(request, saveAssistantMessageSchema);
  if ("response" in parsed) return parsed.response;

  const session = await getOrCreateChatSession(ownerKey, parsed.data.sessionId);
  if (session.id !== parsed.data.sessionId) {
    return Response.json({ error: "Chat session not found" }, { status: 404 });
  }

  await saveChatMessage(ownerKey, session.id, parsed.data.message);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
