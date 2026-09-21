import { reviewUserModelProposal } from "@tinypersonal/backend-api";
import { proposalReviewSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, proposalReviewSchema);
  if ("response" in parsed) return parsed.response;
  const { id } = await context.params;
  const result = await reviewUserModelProposal(ownerKey, id, parsed.data.action);
  return result ? Response.json({ result }) : Response.json({ error: "Pending proposal not found" }, { status: 404 });
}
