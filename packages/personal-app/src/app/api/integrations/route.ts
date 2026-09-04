import { getMarketQuotes, integrationHealth } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request); if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [finance, markets] = await Promise.all([
    integrationHealth("finance"),
    getMarketQuotes().catch(() => []),
  ]);
  return Response.json({ health: [finance], markets }, { headers: { "Cache-Control": "no-store" } });
}
