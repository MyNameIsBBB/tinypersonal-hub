import { deleteVaultSecret, updateVaultMetadata } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as {
    serviceName?: string; category?: string; accountIdentifier?: string;
    url?: string | null; notes?: string | null;
  };
  return Response.json({ secret: await updateVaultMetadata(id, body) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await deleteVaultSecret(id);
  return new Response(null, { status: 204 });
}
