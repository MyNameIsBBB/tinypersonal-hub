import { prisma } from "@tinypersonal/backend-api";
import { statfs } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem, uptime } from "node:os";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const disk = await statfs(process.cwd());
    return Response.json({
      ok: true,
      service: "tinypersonal-hub",
      timestamp: new Date().toISOString(),
      system: {
        memoryUsedBytes: totalmem() - freemem(),
        memoryTotalBytes: totalmem(),
        diskFreeBytes: disk.bavail * disk.bsize,
        diskTotalBytes: disk.blocks * disk.bsize,
        loadAverage1m: loadavg()[0],
        cpuCount: cpus().length,
        uptimeSeconds: uptime(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, service: "tinypersonal-hub" }, { status: 503 });
  }
}
