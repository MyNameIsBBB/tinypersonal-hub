import { describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client";
import { assertSuccessfulToolResult, createPendingAction, recordAudit, supersedePendingActions } from "./auditService";

describe("audit service", () => {
  it("serializes metadata without passing it as an unknown Prisma field", async () => {
    const create = vi.spyOn(prisma.auditLog, "create").mockResolvedValue({} as never);
    await recordAudit({ actorId: "user:test", action: "assistant.prompt", status: "SUCCEEDED", metadata: { selectedTools: ["web.search"], token: "must-not-log" } });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: "user:test", metadataJson: "{\"selectedTools\":[\"web.search\"]}" }) });
    expect(create.mock.calls[0][0].data).not.toHaveProperty("metadata");
    create.mockRestore();
  });
});

describe("tool execution results", () => {
  it("does not report a failed worker result as successful", () => {
    expect(() => assertSuccessfulToolResult({ ok: false, error: { code: "WORKER_FAILED", message: "Worker operation failed" } }))
      .toThrow("Worker operation failed");
  });

  it("accepts successful and non-discriminated service results", () => {
    expect(() => assertSuccessfulToolResult({ ok: true, data: [] })).not.toThrow();
    expect(() => assertSuccessfulToolResult({ id: "schedule-item" })).not.toThrow();
  });
});

describe("batch pending actions", () => {
  it("executes all pending actions for a session in order", async () => {
    const findMany = vi.spyOn(prisma.pendingAction, "findMany").mockResolvedValue([
      { id: "act-1" },
      { id: "act-2" },
    ] as never);
    const auditCreate = vi.spyOn(prisma.auditLog, "create").mockResolvedValue({} as never);
    const updateMany = vi.spyOn(prisma.pendingAction, "updateMany").mockResolvedValue({ count: 1 });
    const findUnique = vi.spyOn(prisma.pendingAction, "findUnique").mockImplementation((async ({ where }: any) => {
      const act = where.id === "act-1" ? { id: "act-1", argumentsJson: '{"id":"n1"}' } : { id: "act-2", argumentsJson: '{"id":"n2"}' };
      return { id: act.id, ownerKey: "u1", toolName: "notes.delete", argumentsJson: act.argumentsJson, summary: `Delete note ${act.id}`, status: "APPROVED", expiresAt: new Date(), createdAt: new Date(), resolvedAt: new Date(), sessionId: "s1" };
    }) as any);
    const deleteNoteMock = vi.spyOn(await import("./noteService"), "deleteNote").mockResolvedValue(undefined as never);

    const { executeAllPendingActions } = await import("./auditService");
    const results = await executeAllPendingActions("u1", "s1", true);

    expect(results).toHaveLength(2);
    expect(deleteNoteMock).toHaveBeenCalledWith("n1");
    expect(deleteNoteMock).toHaveBeenCalledWith("n2");

    findMany.mockRestore();
    auditCreate.mockRestore();
    updateMany.mockRestore();
    findUnique.mockRestore();
    deleteNoteMock.mockRestore();
  });
});

describe("pending action safety", () => {
  it("seals sensitive arguments instead of storing plaintext secrets", async () => {
    const previousKey = process.env.VAULT_MASTER_KEY;
    process.env.VAULT_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    const create = vi.spyOn(prisma.pendingAction, "create").mockImplementation((async ({ data }: any) => ({ ...data, createdAt: new Date(), resolvedAt: null })) as any);
    const auditCreate = vi.spyOn(prisma.auditLog, "create").mockResolvedValue({} as never);

    const action = await createPendingAction({
      ownerKey: "u1",
      sessionId: "s1",
      toolName: "vault.create",
      summary: "Create credential",
      arguments: { accountIdentifier: "admin", password: "plaintext-sentinel" },
      sensitive: true,
    });

    expect(action.argumentsJson).not.toContain("plaintext-sentinel");
    expect(JSON.parse(action.argumentsJson)).toHaveProperty("sealed.ciphertext");
    create.mockRestore();
    auditCreate.mockRestore();
    if (previousKey === undefined) delete process.env.VAULT_MASTER_KEY;
    else process.env.VAULT_MASTER_KEY = previousKey;
  });

  it("denies stale proposals when a new request replaces them", async () => {
    const updateMany = vi.spyOn(prisma.pendingAction, "updateMany").mockResolvedValue({ count: 2 });
    await supersedePendingActions("u1", "s1");
    expect(updateMany).toHaveBeenCalledWith({
      where: { ownerKey: "u1", sessionId: "s1", status: "PENDING" },
      data: { status: "DENIED", resolvedAt: expect.any(Date) },
    });
    updateMany.mockRestore();
  });
});
