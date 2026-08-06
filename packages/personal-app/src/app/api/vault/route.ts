import { createVaultSecret, searchVaultMetadata } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ secrets: await searchVaultMetadata(query) });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = await request.json() as {
    serviceName?: string; category?: string; accountIdentifier?: string; password?: string;
    url?: string; notes?: string; totpSeed?: string;
  };
  if (!input.serviceName || !input.category || !input.accountIdentifier || !input.password) {
    return Response.json({ error: "Missing required vault fields" }, { status: 400 });
  }
  const secret = await createVaultSecret({
    serviceName: input.serviceName, category: input.category,
    accountIdentifier: input.accountIdentifier, password: input.password,
    url: input.url, notes: input.notes, totpSeed: input.totpSeed,
  });
  return Response.json({ secret }, { status: 201 });
}
