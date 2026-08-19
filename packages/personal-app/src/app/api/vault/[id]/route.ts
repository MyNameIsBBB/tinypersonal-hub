import { deleteVaultSecret, updateVaultMetadata } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { vaultMetadataUpdateSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = await parseJson(request, vaultMetadataUpdateSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  return Response.json({ secret: await updateVaultMetadata(id, body) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await deleteVaultSecret(id);
  return new Response(null, { status: 204 });
}
