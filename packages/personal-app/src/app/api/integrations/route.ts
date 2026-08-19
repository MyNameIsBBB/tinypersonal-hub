import { getMarketQuotes, integrationHealth } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request); if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [health, markets] = await Promise.all([
    Promise.all([integrationHealth("google-calendar"), integrationHealth("gmail"), integrationHealth("finance")]),
    getMarketQuotes().catch(() => []),
  ]);
  return Response.json({ health, markets }, { headers: { "Cache-Control": "no-store" } });
}
