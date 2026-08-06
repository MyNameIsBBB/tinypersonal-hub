import { prisma } from "@tinypersonal/backend-api";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, service: "tinypersonal-hub", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, service: "tinypersonal-hub" }, { status: 503 });
  }
}
