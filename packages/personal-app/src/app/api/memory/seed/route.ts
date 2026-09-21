import { importUserModelSeed } from "@tinypersonal/backend-api";
import { memorySeedSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, memorySeedSchema);
  if ("response" in parsed) return parsed.response;
  try {
    return Response.json({ snapshot: await importUserModelSeed(ownerKey, parsed.data.profileText) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Seed import failed" }, { status: 409 });
  }
}
