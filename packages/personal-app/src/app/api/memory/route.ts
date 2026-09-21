import { listMemoryWorkspace } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 100;
  return Response.json(await listMemoryWorkspace(ownerKey, limit), {
    headers: { "Cache-Control": "no-store" },
  });
}
