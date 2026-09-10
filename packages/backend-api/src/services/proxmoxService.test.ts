import { afterEach, describe, expect, it, vi } from "vitest";
import { createProxmoxVm, proxmoxCreateVmSchema } from "./proxmoxService";

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
