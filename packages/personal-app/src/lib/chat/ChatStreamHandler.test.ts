import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { confirmationDecision, hasRenderableMessageContent, mergeServerMessages, selectContextWindow } from "./ChatStreamHandler";

describe("chat context window", () => {
  it("keeps a local message missing from a delayed server snapshot", () => {
    const server = [{ id: "a", role: "user", parts: [{ type: "text", text: "A" }] }] as UIMessage[];
    const local = [...server, { id: "b", role: "assistant", parts: [{ type: "text", text: "B" }] }] as UIMessage[];
    expect(mergeServerMessages(local, server).map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("uses durable server content after the same message ID persists", () => {
    const local = [{ id: "b", role: "assistant", parts: [{ type: "text", text: "partial" }] }] as UIMessage[];
    const server = [{ id: "b", role: "assistant", parts: [{ type: "text", text: "complete" }] }] as UIMessage[];
    expect((mergeServerMessages(local, server)[0].parts[0] as { text: string }).text).toBe("complete");
  });

  it("replaces the transient queued acknowledgement with the durable job response", () => {
    const local = [{ id: "chat-queued-job-1", role: "assistant", parts: [{ type: "text", text: "queued" }] }] as UIMessage[];
    const server = [{ id: "chat-job-job-1", role: "assistant", parts: [{ type: "text", text: "done" }] }] as UIMessage[];
    expect(mergeServerMessages(local, server).map(({ id }) => id)).toEqual(["chat-job-job-1"]);
  });

  it("distinguishes an empty job placeholder from a renderable response", () => {
    const placeholder = { id: "chat-job-1", role: "assistant", parts: [{ type: "text", text: "" }] } as UIMessage;
    const response = { ...placeholder, parts: [{ type: "text", text: "done" }] } as UIMessage;
    expect(hasRenderableMessageContent(placeholder)).toBe(false);
    expect(hasRenderableMessageContent(response)).toBe(true);
  });

  it("keeps at most 16 recent messages", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({ id: String(index), role: "user" as const, parts: [{ type: "text" as const, text: String(index) }] }));
    expect(selectContextWindow(messages)).toHaveLength(16);
  });

  it("replaces old raw tool output with a short summary", () => {
    const messages = [
      { id: "1", role: "assistant", parts: [{ type: "tool-searchWeb", toolCallId: "call", state: "output-available", input: {}, output: { results: "x".repeat(5_000) } }] },
      { id: "2", role: "user", parts: [{ type: "text", text: "สรุปให้หน่อย" }] },
    ] as UIMessage[];
    const context = selectContextWindow(messages);
    expect(JSON.stringify(context)).not.toContain("x".repeat(1_000));
    expect(JSON.stringify(context)).toContain("raw historical payload omitted");
  });

  it("converts windowed messages with tool outputs to model messages", async () => {
    const { convertToModelMessages } = await import("ai");
    const testMessages = [
      { id: "1", role: "user", parts: [{ type: "text", text: "ค้นหาโน้ต test" }] },
      { id: "2", role: "assistant", parts: [{ type: "tool-searchNotes", toolCallId: "call-1", state: "output-available", input: { query: "test" }, output: { ok: true, notes: [{ id: "n1", title: "test note", content: "test content", tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] } }] },
      { id: "3", role: "user", parts: [{ type: "text", text: "มีกี่โน้ต" }] },
    ] as UIMessage[];
    const windowed = selectContextWindow(testMessages);
    const converted = await convertToModelMessages(windowed);
    expect(converted).toBeDefined();
    expect(converted.length).toBeGreaterThan(0);
  });
});

describe("confirmationDecision", () => {
  it("recognizes concise approval and denial replies", () => {
    expect(confirmationDecision("ยืนยันครับ")).toBe(true);
    expect(confirmationDecision("เอาเลย")).toBe(true);
    expect(confirmationDecision("ยกเลิก")).toBe(false);
    expect(confirmationDecision("cancel please")).toBeNull();
  });

  it("does not execute from a general sentence", () => {
    expect(confirmationDecision("ช่วยยืนยันเวลานัดให้หน่อย")).toBeNull();
  });
});
