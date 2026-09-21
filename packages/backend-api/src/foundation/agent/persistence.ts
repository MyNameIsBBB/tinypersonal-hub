import {
  completeAgentRunTrace,
} from "../trace/agentTraceService";
import {
  generateAndUpdateSessionTitle,
  saveAssistantChatMessageIfCurrent,
} from "../../features/chat/chatService";
import { consumeStream, type UIMessage } from "ai";

export type PersistenceInput = {
  ownerKey: string;
  sessionId: string;
  triggeringUserMessageId: string;
  trace?: { id: string; startedAt: number };
  shouldCompleteTrace?: () => boolean;
  afterPersist?: (assistantText: string) => Promise<void>;
};

export function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}

export async function reserveAssistantMessage(
  input: PersistenceInput & { responseMessageId: string }
) {
  await saveAssistantChatMessageIfCurrent(
    input.ownerKey,
    input.sessionId,
    input.triggeringUserMessageId,
    {
      id: input.responseMessageId,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
    }
  );
}

export function createPersistenceEndHandler(input: PersistenceInput) {
  return async ({ messages }: { messages: UIMessage[] }) => {
    try {
      const responseMessage = messages.at(-1);
      if (responseMessage?.role === "assistant" && responseMessage.parts.length > 0) {
        await saveAssistantChatMessageIfCurrent(
          input.ownerKey,
          input.sessionId,
          input.triggeringUserMessageId,
          responseMessage
        );
        await generateAndUpdateSessionTitle(input.ownerKey, input.sessionId);
        if (input.trace && (input.shouldCompleteTrace?.() ?? true)) {
          await completeAgentRunTrace(input.trace.id, {
            finalResponse: messageText(responseMessage),
            durationMs: Date.now() - input.trace.startedAt,
          });
        }
        if (input.afterPersist) await input.afterPersist(messageText(responseMessage));
      }
    } catch (error) {
      console.error(
        "Failed to persist completed chat stream",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  };
}

export function consumePersistenceStream(stream: ReadableStream) {
  return Promise.resolve(
    consumeStream({
      stream,
      onError: (error) =>
        console.error(
          "Failed to consume chat persistence stream",
          error instanceof Error ? error.message : "Unknown error"
        ),
    })
  );
}
