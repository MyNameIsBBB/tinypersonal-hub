import type { UIMessage } from "ai";

const maxStoredMessages = 120;
const maxContextMessages = 16;
const maxContextCharacters = 24_000;
const maxToolSummaryCharacters = 600;
type MessagePart = UIMessage["parts"][number];
type ToolLikePart = MessagePart & { output?: unknown };

export function retainChatMessages(messages: UIMessage[]) { return messages.slice(-maxStoredMessages); }

function summarizeToolOutput(output: unknown): string {
  if (output === undefined) return "Tool completed.";
  if (typeof output === "string") return output.slice(0, maxToolSummaryCharacters);
  if (typeof output === "object" && output !== null) {
    const record = output as Record<string, unknown>;
    if (typeof record.summary === "string") return record.summary.slice(0, maxToolSummaryCharacters);
    if (record.ok === false && typeof record.error === "object" && record.error !== null) {
      const message = (record.error as Record<string, unknown>).message;
      if (typeof message === "string") return `Tool error: ${message.slice(0, maxToolSummaryCharacters)}`;
    }
  }
  return "Tool completed; raw historical payload omitted.";
}

function sanitizeHistoricalMessage(message: UIMessage, isLatest: boolean): UIMessage {
  if (isLatest) return message;
  return { ...message, parts: message.parts.map((part): MessagePart => {
    if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return part;
    const toolPart = part as ToolLikePart;
    if (!("output" in toolPart)) return part;
    return { ...toolPart, output: summarizeToolOutput(toolPart.output) } as MessagePart;
  }) };
}

/** Bounded sliding window with summaries in place of stale tool JSON. */
export function selectContextWindow(messages: UIMessage[]) {
  const tail = messages.slice(-maxContextMessages);
  const sanitized = tail.map((message, index) => sanitizeHistoricalMessage(message, index === tail.length - 1));
  const selected: UIMessage[] = [];
  let characters = 0;
  for (let index = sanitized.length - 1; index >= 0; index--) {
    const message = sanitized[index];
    const size = JSON.stringify(message).length;
    if (selected.length > 0 && characters + size > maxContextCharacters) break;
    selected.unshift(message);
    characters += size;
  }
  return selected;
}

export function latestUserText(messages: UIMessage[]) {
  const message = [...messages].reverse().find(({ role }) => role === "user");
  return message?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim() ?? "";
}

export function confirmationDecision(text: string): boolean | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/^(ยืนยัน|ยืนยันเลย|ตกลง|โอเค|ได้เลย|เอาเลย|ทำเลย|confirm|yes|ok)(ครับ|ค่ะ|คะ)?$/u.test(normalized)) return true;
  if (/^(ยกเลิก|ไม่ยืนยัน|ไม่เอา|ไม่ต้อง|cancel|no)(ครับ|ค่ะ|คะ)?$/u.test(normalized)) return false;
  return null;
}
