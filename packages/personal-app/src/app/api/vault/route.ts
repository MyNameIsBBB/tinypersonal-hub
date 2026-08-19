import { createVaultSecret, searchVaultMetadata } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { vaultCreateSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ secrets: await searchVaultMetadata(query) });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, vaultCreateSchema); if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  const secret = await createVaultSecret({
    serviceName: input.serviceName, category: input.category,
    accountIdentifier: input.accountIdentifier, password: input.password,
    url: input.url || undefined, notes: input.notes, totpSeed: input.totpSeed,
  });
  return Response.json({ secret }, { status: 201 });
}
