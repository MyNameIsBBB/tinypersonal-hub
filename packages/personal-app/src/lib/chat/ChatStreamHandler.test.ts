import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { selectContextWindow } from "./ChatStreamHandler";

describe("chat context window", () => {
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
});
