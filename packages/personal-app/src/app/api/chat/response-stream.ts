import { saveAssistantChatMessageIfCurrent } from "@tinypersonal/backend-api";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export async function directTextResponse(
  ownerKey: string,
  sessionId: string,
  userMessageId: string,
  responseText: string,
  messageId = crypto.randomUUID(),
) {
  const responseMessage: UIMessage = {
    id: messageId,
    role: "assistant",
    parts: [{ type: "text", text: responseText }],
  };
  await saveAssistantChatMessageIfCurrent(ownerKey, sessionId, userMessageId, responseMessage);
  const textPartId = crypto.randomUUID();
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId: responseMessage.id });
      writer.write({ type: "text-start", id: textPartId });
      writer.write({ type: "text-delta", id: textPartId, delta: responseText });
      writer.write({ type: "text-end", id: textPartId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({
    stream,
    headers: { "X-Chat-Session-Id": sessionId },
  });
}

export function queuedTextResponse(jobId: string) {
  const messageId = `chat-queued-${jobId}`;
  const textPartId = crypto.randomUUID();
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "text-start", id: textPartId });
      writer.write({
        type: "text-delta",
        id: textPartId,
        delta: "รับข้อความแล้ว กำลังประมวลผลที่เซิร์ฟเวอร์ครับ…",
      });
      writer.write({ type: "text-end", id: textPartId });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
