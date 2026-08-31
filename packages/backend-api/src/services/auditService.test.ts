import { describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client";
import { assertSuccessfulToolResult, recordAudit } from "./auditService";

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
    expect(() => assertSuccessfulToolResult({ ok: false, error: { code: "HA_NOT_CONFIGURED", message: "HA_URL and HA_TOKEN are required" } }))
      .toThrow("HA_URL and HA_TOKEN are required");
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
    const findFirst = vi.spyOn(prisma.pendingAction, "findFirst")
      .mockResolvedValueOnce({ id: "act-1", ownerKey: "u1", toolName: "notes.delete", argumentsJson: '{"id":"n1"}', summary: "Delete note 1", status: "PENDING", expiresAt: new Date(Date.now() + 60000) } as never)
      .mockResolvedValueOnce({ id: "act-2", ownerKey: "u1", toolName: "notes.delete", argumentsJson: '{"id":"n2"}', summary: "Delete note 2", status: "PENDING", expiresAt: new Date(Date.now() + 60000) } as never);
    const update = vi.spyOn(prisma.pendingAction, "update").mockImplementation((async ({ where, data }: any) => {
      const act = where.id === "act-1" ? { id: "act-1", argumentsJson: '{"id":"n1"}' } : { id: "act-2", argumentsJson: '{"id":"n2"}' };
      return { id: act.id, ownerKey: "u1", toolName: "notes.delete", argumentsJson: act.argumentsJson, summary: `Delete note ${act.id}`, status: data.status, expiresAt: new Date(), createdAt: new Date(), resolvedAt: new Date(), sessionId: "s1" };
    }) as any);
    const deleteNoteMock = vi.spyOn(await import("./noteService"), "deleteNote").mockResolvedValue(undefined as never);

    const { executeAllPendingActions } = await import("./auditService");
    const results = await executeAllPendingActions("u1", "s1", true);

    expect(results).toHaveLength(2);
    expect(deleteNoteMock).toHaveBeenCalledWith("n1");
    expect(deleteNoteMock).toHaveBeenCalledWith("n2");

    findMany.mockRestore();
    auditCreate.mockRestore();
    findFirst.mockRestore();
    update.mockRestore();
    deleteNoteMock.mockRestore();
  });
});

