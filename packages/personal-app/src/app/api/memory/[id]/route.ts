import { reviewMemory } from "@tinypersonal/backend-api";
import { memoryReviewSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, memoryReviewSchema);
  if ("response" in parsed) return parsed.response;
  const { id } = await context.params;
  const memory = await reviewMemory(ownerKey, id, parsed.data.action);
  return memory ? Response.json({ memory }) : Response.json({ error: "Memory not found" }, { status: 404 });
}
