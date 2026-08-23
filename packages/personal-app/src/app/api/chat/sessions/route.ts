import { createChatSession, listChatSessions } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";

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
