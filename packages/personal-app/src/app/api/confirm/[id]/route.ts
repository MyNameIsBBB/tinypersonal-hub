import { executePendingAction } from "@tinypersonal/backend-api";
import { z } from "zod";
import { authorizedOwnerKey } from "@/lib/serverAuth";
import { parseJson } from "@/lib/apiValidation";

const decisionSchema = z.object({ approved: z.boolean() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerKey = authorizedOwnerKey(request); if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseJson(request, decisionSchema); if ("response" in parsed) return parsed.response;
  const { id } = await context.params;
  try {
    const execution = await executePendingAction(ownerKey, id, parsed.data.approved);
    if (!execution) return Response.json({ error: "Confirmation not found or expired" }, { status: 404 });
    return Response.json({ ok: true, denied: execution.denied, result: execution.result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Execution failed" }, { status: 400 });
  }
}
