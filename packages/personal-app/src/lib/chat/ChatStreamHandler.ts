import type { UIMessage } from "ai";

const maxStoredMessages = 120;
const maxContextMessages = 16;
const maxContextCharacters = 24_000;
const maxToolSummaryCharacters = 600;
const maxVisiblePendingJobAgeMs = 15 * 60_000;
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

function toolName(part: MessagePart): string | null {
  if (part.type === "dynamic-tool") {
    const name = (part as MessagePart & { toolName?: unknown }).toolName;
    return typeof name === "string" ? name : null;
  }
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

function sanitizeHistoricalMessage(message: UIMessage, isLatest: boolean): UIMessage {
  if (isLatest) return message;
  return { ...message, parts: message.parts.map((part): MessagePart => {
    if (part.type === "file") return { type: "text", text: `[Historical image omitted from model context: ${part.filename ?? "image"}]` } as MessagePart;
    if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return part;
    const historicalToolName = toolName(part);
    const toolPart = part as ToolLikePart;
    const summary = "output" in toolPart
      ? summarizeToolOutput(toolPart.output)
      : "Tool call did not produce a usable result.";
    return {
      type: "text",
      text: `[Historical tool ${historicalToolName ?? "unknown"}: ${summary}]`,
    } as MessagePart;
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

/** True only after an assistant placeholder has content the chat can display. */
export function hasRenderableMessageContent(message: UIMessage | undefined) {
  return Boolean(message?.parts.some((part) =>
    part.type === "text" ? part.text.trim().length > 0 : true,
  ));
}

type ChatGenerationProgress = {
  status: string;
  createdAt: string;
};

/**
 * A terminal or abandoned server job must never leave the global thinking
 * indicator visible. Old queued jobs can survive a stopped worker, so only a
 * recent QUEUED/RUNNING job represents work the user is currently waiting on.
 */
export function isChatGenerationPending(
  job: ChatGenerationProgress | null,
  nowMs = Date.now(),
) {
  if (!job || (job.status !== "QUEUED" && job.status !== "RUNNING")) return false;
  const createdAtMs = Date.parse(job.createdAt);
  return Number.isFinite(createdAtMs)
    && nowMs >= createdAtMs
    && nowMs - createdAtMs <= maxVisiblePendingJobAgeMs;
}

/** Merge durable messages without dropping optimistic or still-streaming UI messages. */
export function mergeServerMessages(local: UIMessage[], server: UIMessage[]) {
  const serverIds = new Set(server.map(({ id }) => id));
  const completedJobIds = new Set(server.filter(({ id }) => id.startsWith("chat-job-")).map(({ id }) => id.slice("chat-job-".length)));
  return [...server, ...local.filter(({ id }) => !serverIds.has(id) && !(id.startsWith("chat-queued-") && completedJobIds.has(id.slice("chat-queued-".length))))];
}

export function confirmationDecision(text: string): boolean | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/^(?:(?:โอเค|ตกลง|ok|okay)(?:ครับ|ค่ะ|คะ)?\s+)?(?:ยืนยัน(?:เลย)?|confirm|yes)(?:ครับ|ค่ะ|คะ)?$/u.test(normalized)) return true;
  if (/^(ยืนยัน|ยืนยันเลย|ตกลง|โอเค|ได้เลย|เอาเลย|ทำเลย|จัดการ|ดำเนินการ|confirm|yes|ok)(ครับ|ค่ะ|คะ)?$/u.test(normalized)) return true;
  if (/^(ยกเลิก|ไม่ยืนยัน|ไม่เอา|ไม่ต้อง|cancel|no)(ครับ|ค่ะ|คะ)?$/u.test(normalized)) return false;
  return null;
}
