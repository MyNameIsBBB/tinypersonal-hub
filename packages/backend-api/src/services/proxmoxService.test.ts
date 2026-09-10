import { afterEach, describe, expect, it, vi } from "vitest";
import { createProxmoxVm, getProxmoxNodeStatus, listProxmoxVms, proxmoxCreateVmSchema } from "./proxmoxService";

const validInput = {
  node: "pve1",
  vmId: 120,
  name: "discord-vm",
  storage: "local-lvm",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PROXMOX_BASE_URL;
  delete process.env.PROXMOX_TOKEN_ID;
  delete process.env.PROXMOX_TOKEN_SECRET;
});

describe("createProxmoxVm", () => {
  it("rejects unsafe identifiers at the backend boundary", () => {
    expect(() => proxmoxCreateVmSchema.parse({ ...validInput, node: "../node" })).toThrow();
    expect(() => proxmoxCreateVmSchema.parse({ ...validInput, iso: "https://example.com/file.iso" })).toThrow();
  });

  it("stays disabled when credentials are absent", async () => {
    await expect(createProxmoxVm(validInput)).resolves.toMatchObject({ ok: false, error: { code: "NOT_CONFIGURED" } });
  });

  it("creates a bounded QEMU request without exposing the token in the body", async () => {
    process.env.PROXMOX_BASE_URL = "https://pve.example.test:8006";
    process.env.PROXMOX_TOKEN_ID = "robot@pve!tinypersonal";
    process.env.PROXMOX_TOKEN_SECRET = "secret-value";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: "UPID:pve1:123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createProxmoxVm(validInput)).resolves.toEqual({
      ok: true,
      data: { node: "pve1", vmId: 120, name: "discord-vm", taskId: "UPID:pve1:123" },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://pve.example.test:8006/api2/json/nodes/pve1/qemu");
    expect(init.headers).toMatchObject({ Authorization: "PVEAPIToken=robot@pve!tinypersonal=secret-value" });
    expect(String(init.body)).toContain("vmid=120");
    expect(String(init.body)).not.toContain("secret-value");
  });
});

describe("Proxmox status reads", () => {
  function configure() {
    process.env.PROXMOX_BASE_URL = "https://pve.example.test:8006";
    process.env.PROXMOX_TOKEN_ID = "robot@pve!tinypersonal";
    process.env.PROXMOX_TOKEN_SECRET = "secret-value";
  }

  it("normalizes node status", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {
      uptime: 90_000,
      cpu: 0.125,
      cpuinfo: { cpus: 8 },
      memory: { used: 4 * 1024 ** 3, total: 16 * 1024 ** 3 },
      loadavg: ["0.10", "0.20", "0.30"],
    } }), { status: 200 })));

    await expect(getProxmoxNodeStatus("pve1")).resolves.toEqual({ ok: true, data: {
      node: "pve1",
      status: "online",
      uptimeSeconds: 90_000,
      cpuUsage: 0.125,
      cpuCores: 8,
      memoryUsed: 4 * 1024 ** 3,
      memoryTotal: 16 * 1024 ** 3,
      loadAverage: ["0.10", "0.20", "0.30"],
    } });
  });

  it("lists and sorts QEMU VM status", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { vmid: 102, name: "second", status: "stopped", cpus: 2, maxmem: 2048 },
      { vmid: 100, name: "first", status: "running", uptime: 3600, cpu: 0.25, cpus: 4, mem: 1024, maxmem: 4096 },
    ] }), { status: 200 })));

    const result = await listProxmoxVms("pve1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.map((vm) => vm.vmId)).toEqual([100, 102]);
  });
});
