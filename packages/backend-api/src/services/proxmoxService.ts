import { z } from "zod";

const resourceName = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const proxmoxCreateVmSchema = z.object({
  node: resourceName,
  vmId: z.number().int().min(100).max(999_999_999),
  name: z.string().trim().min(1).max(63).regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/),
  cores: z.number().int().min(1).max(128).default(2),
  sockets: z.number().int().min(1).max(8).default(1),
  memoryMb: z.number().int().min(128).max(1_048_576).default(2048),
  storage: resourceName,
  diskGb: z.number().int().min(1).max(65_536).default(32),
  bridge: resourceName.default("vmbr0"),
  iso: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._-]+:[A-Za-z0-9_][A-Za-z0-9_./-]*$/).optional(),
  osType: z.enum(["l26", "win10", "win11", "other"]).default("l26"),
  onBoot: z.boolean().default(false),
  description: z.string().trim().max(2_000).optional(),
}).strict();

export type ProxmoxCreateVmInput = z.infer<typeof proxmoxCreateVmSchema>;
export type ProxmoxCreateVmResult =
  | { ok: true; data: { node: string; vmId: number; name: string; taskId: string } }
  | { ok: false; error: { code: "NOT_CONFIGURED" | "REQUEST_FAILED" | "INVALID_RESPONSE"; message: string } };

export type ProxmoxStatusError = { code: "NOT_CONFIGURED" | "REQUEST_FAILED" | "INVALID_RESPONSE"; message: string };
export type ProxmoxNodeStatus = {
  node: string;
  status: string;
  uptimeSeconds: number;
  cpuUsage: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
  loadAverage: string[];
};
export type ProxmoxVmStatus = {
  node: string;
  vmId: number;
  name: string;
  status: string;
  uptimeSeconds: number;
  cpuUsage: number;
  cpuCores: number;
  memoryUsed: number;
  memoryTotal: number;
};

function configuration() {
  const baseUrl = process.env.PROXMOX_BASE_URL?.trim().replace(/\/+$/, "");
  const tokenId = process.env.PROXMOX_TOKEN_ID?.trim();
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET?.trim();
  if (!baseUrl || !tokenId || !tokenSecret) return null;
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:") throw new Error("PROXMOX_BASE_URL must use HTTPS");
  return { baseUrl, tokenId, tokenSecret };
}

async function proxmoxGet(path: string): Promise<{ ok: true; data: unknown } | { ok: false; error: ProxmoxStatusError }> {
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
  } catch (error) {
    return { ok: false, error: { code: "NOT_CONFIGURED", message: error instanceof Error ? error.message : "Invalid Proxmox configuration" } };
  }
  if (!config) return { ok: false, error: { code: "NOT_CONFIGURED", message: "Proxmox credentials are not configured" } };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { ok: false, error: { code: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Proxmox request failed" } };
  }
  if (!response.ok) return { ok: false, error: { code: "REQUEST_FAILED", message: `Proxmox API returned HTTP ${response.status}` } };
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  if (!payload || !("data" in payload)) return { ok: false, error: { code: "INVALID_RESPONSE", message: "Proxmox API returned an invalid response" } };
  return { ok: true, data: payload.data };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function vmStatus(node: string, value: Record<string, unknown>): ProxmoxVmStatus | null {
  const vmId = finiteNumber(value.vmid);
  if (!Number.isInteger(vmId) || vmId < 100) return null;
  return {
    node,
    vmId,
    name: typeof value.name === "string" && value.name ? value.name : `VM ${vmId}`,
    status: typeof value.status === "string" ? value.status : "unknown",
    uptimeSeconds: finiteNumber(value.uptime),
    cpuUsage: finiteNumber(value.cpu),
    cpuCores: finiteNumber(value.cpus),
    memoryUsed: finiteNumber(value.mem),
    memoryTotal: finiteNumber(value.maxmem),
  };
}

export async function getProxmoxNodeStatus(node: string): Promise<{ ok: true; data: ProxmoxNodeStatus } | { ok: false; error: ProxmoxStatusError }> {
  const safeNode = resourceName.parse(node);
  const result = await proxmoxGet(`/api2/json/nodes/${encodeURIComponent(safeNode)}/status`);
  if (!result.ok) return result;
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return { ok: false, error: { code: "INVALID_RESPONSE", message: "Proxmox node status was invalid" } };
  }
  const data = result.data as Record<string, unknown>;
  const memory = data.memory && typeof data.memory === "object" && !Array.isArray(data.memory) ? data.memory as Record<string, unknown> : {};
  return { ok: true, data: {
    node: safeNode,
    status: "online",
    uptimeSeconds: finiteNumber(data.uptime),
    cpuUsage: finiteNumber(data.cpu),
    cpuCores: finiteNumber(data.cpuinfo && typeof data.cpuinfo === "object" ? (data.cpuinfo as Record<string, unknown>).cpus : 0),
    memoryUsed: finiteNumber(memory.used),
    memoryTotal: finiteNumber(memory.total),
    loadAverage: Array.isArray(data.loadavg) ? data.loadavg.filter((item): item is string => typeof item === "string").slice(0, 3) : [],
  } };
}

export async function listProxmoxVms(node: string, vmId?: number): Promise<{ ok: true; data: ProxmoxVmStatus[] } | { ok: false; error: ProxmoxStatusError }> {
  const safeNode = resourceName.parse(node);
  const safeVmId = vmId === undefined ? undefined : z.number().int().min(100).max(999_999_999).parse(vmId);
  const suffix = safeVmId === undefined ? "" : `/${safeVmId}/status/current`;
  const result = await proxmoxGet(`/api2/json/nodes/${encodeURIComponent(safeNode)}/qemu${suffix}`);
  if (!result.ok) return result;
  const values = safeVmId === undefined ? result.data : [result.data];
  if (!Array.isArray(values)) return { ok: false, error: { code: "INVALID_RESPONSE", message: "Proxmox VM status was invalid" } };
  const vms = values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .map((value) => vmStatus(safeNode, value))
    .filter((value): value is ProxmoxVmStatus => value !== null)
    .sort((a, b) => a.vmId - b.vmId);
  return { ok: true, data: vms };
}

/** Creates a QEMU VM and returns the Proxmox asynchronous task ID (UPID). */
export async function createProxmoxVm(rawInput: unknown): Promise<ProxmoxCreateVmResult> {
  const input = proxmoxCreateVmSchema.parse(rawInput);
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
  } catch (error) {
    return { ok: false, error: { code: "NOT_CONFIGURED", message: error instanceof Error ? error.message : "Invalid Proxmox configuration" } };
  }
  if (!config) {
    return { ok: false, error: { code: "NOT_CONFIGURED", message: "Proxmox credentials are not configured" } };
  }

  const form = new URLSearchParams({
    vmid: String(input.vmId),
    name: input.name,
    cores: String(input.cores),
    sockets: String(input.sockets),
    memory: String(input.memoryMb),
    ostype: input.osType,
    scsihw: "virtio-scsi-single",
    scsi0: `${input.storage}:${input.diskGb},iothread=1`,
    net0: `virtio,bridge=${input.bridge}`,
    agent: "enabled=1",
    onboot: input.onBoot ? "1" : "0",
    ...(input.iso ? { ide2: `${input.iso},media=cdrom`, boot: "order=scsi0;ide2;net0" } : { boot: "order=scsi0;net0" }),
    ...(input.description ? { description: input.description } : {}),
  });

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api2/json/nodes/${encodeURIComponent(input.node)}/qemu`, {
      method: "POST",
      headers: {
        Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return { ok: false, error: { code: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Proxmox request failed" } };
  }
  if (!response.ok) {
    return { ok: false, error: { code: "REQUEST_FAILED", message: `Proxmox API returned HTTP ${response.status}` } };
  }
  const payload = await response.json().catch(() => null) as { data?: unknown } | null;
  if (!payload || typeof payload.data !== "string" || !payload.data) {
    return { ok: false, error: { code: "INVALID_RESPONSE", message: "Proxmox API did not return a task ID" } };
  }
  return { ok: true, data: { node: input.node, vmId: input.vmId, name: input.name, taskId: payload.data } };
}

export function proxmoxHealth() {
  try {
    return { name: "proxmox" as const, configured: Boolean(configuration()), checkedAt: new Date().toISOString() };
  } catch {
    return { name: "proxmox" as const, configured: false, checkedAt: new Date().toISOString() };
  }
}
