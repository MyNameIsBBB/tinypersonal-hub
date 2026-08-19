import { recordAudit, revealVaultSecret } from "@tinypersonal/backend-api";
import { isAuthorizedRequest, verifyVaultStepUp } from "@/lib/serverAuth";
import { vaultRevealSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = await parseJson(request, vaultRevealSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  if (!verifyVaultStepUp(body.password)) { await recordAudit({ actorId: "authorized-local-user", action: "vault.reveal", targetType: "VaultSecret", targetId: id, status: "DENIED" }); return Response.json({ error: "Step-up authentication required" }, { status: 403 }); }
  const revealed = await revealVaultSecret(id, {
    actorId: "authorized-local-user",
    reason: body.reason,
    verify: async () => true,
  });
  await recordAudit({ actorId: "authorized-local-user", action: "vault.reveal", targetType: "VaultSecret", targetId: id, status: "SUCCEEDED", metadata: { reason: body.reason } });
  return Response.json(revealed, { headers: { "Cache-Control": "no-store" } });
}
