import { maybeCreateReflectionProposal } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const proposal = await maybeCreateReflectionProposal(ownerKey, true);
    return Response.json({ proposal });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reflection failed" }, { status: 500 });
  }
}
