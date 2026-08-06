import { revealVaultSecret } from "@tinypersonal/backend-api";
import { isAuthorizedRequest, verifyVaultStepUp } from "@/lib/serverAuth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as { reason?: string; password?: string };
  if (!verifyVaultStepUp(body.password ?? "")) return Response.json({ error: "Step-up authentication required" }, { status: 403 });
  const revealed = await revealVaultSecret(id, {
    actorId: "authorized-local-user",
    reason: body.reason ?? "",
    verify: async () => true,
  });
  return Response.json(revealed, { headers: { "Cache-Control": "no-store" } });
}
