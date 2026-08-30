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
