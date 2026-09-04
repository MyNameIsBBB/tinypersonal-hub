import { listAgentRunTraces } from "@tinypersonal/backend-api";
import { resolveChatOwnerKey } from "../request-context";

export async function GET(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 30);
  const limit = Number.isInteger(rawLimit) ? rawLimit : 30;
  return Response.json(
    { traces: await listAgentRunTraces(ownerKey, limit) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
