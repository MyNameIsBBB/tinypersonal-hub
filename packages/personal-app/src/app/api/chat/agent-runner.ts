import { google } from "@ai-sdk/google";
import {
  appendAgentToolTraces,
  createAgentRunTrace,
  describeAgentError,
  failAgentRunTrace,
  recordAudit,
  saveConversationState,
} from "@tinypersonal/backend-api";
import {
  conversationStateSchema,
  createAgentConfig,
  requiredFirstTool,
  resolveConversationReference,
  routeWithState,
  scopeToolsForMessage,
  stateAfterToolResult,
  stateFromScope,
  type ConversationState,
  type ToolName,
} from "@tinypersonal/assistant-core";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { selectContextWindow } from "@/lib/chat/ChatStreamHandler";
import { buildAgentContext } from "./context-builder";
import { createChatTools } from "./tool-adapter-factory";
import { classifyIntentWithGemini } from "./intent-classifier";
import {
  consumePersistenceStream,
  createPersistenceEndHandler,
  reserveAssistantMessage,
} from "./persistence";

type RunAgentInput = {
  ownerKey: string;
  sessionId: string;
  triggeringUserMessageId: string;
  responseMessageId: string;
  userText: string;
  baseMessages: UIMessage[];
  customSystemPrompt: string | null;
  voiceMode?: boolean;
  visionContext?: { currentUrl: string; title: string };
  conversationState?: unknown;
};

export async function runChatAgent(input: RunAgentInput) {
  const startedAt = Date.now();
  let traceFailed = false;
  const modelName = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const parsedState = conversationStateSchema.safeParse(input.conversationState);
  let conversationState: ConversationState | null = parsedState.success ? parsedState.data : null;
  conversationState = resolveConversationReference(conversationState, input.userText);
  const deterministicScope = routeWithState(
    input.userText,
    scopeToolsForMessage(input.userText),
    conversationState,
  );
  const classifierScope = deterministicScope.confidence < 0.9
    ? await classifyIntentWithGemini({
        message: input.userText,
        state: conversationState,
        deterministicScope,
      })
    : null;
  const scope = classifierScope ?? deterministicScope;
  conversationState = stateFromScope(scope, conversationState);
  if (conversationState) {
    await saveConversationState(input.ownerKey, input.sessionId, conversationState);
  }
  const requiredTool = requiredFirstTool(scope, input.userText);
  let executedToolCount = 0;
  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    scope.allowedTools,
  );
  await recordAudit({
    actorId: input.ownerKey,
    action: "assistant.prompt",
    status: "SUCCEEDED",
    promptVersion: "jarvis-v3",
    targetType: "ChatSession",
    targetId: input.sessionId,
    metadata: {
      intent: scope.primaryIntent,
      intents: scope.intents,
      availableTools: scope.allowedTools,
      scopeConfidence: scope.confidence,
      requiredTool: requiredTool?.tool,
      requiredToolReason: requiredTool?.reason,
      classifierUsed: Boolean(classifierScope),
      routing: "gemini",
      messageCount: input.baseMessages.length,
    },
  });

  const context = await buildAgentContext({
    intents: scope.intents,
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    userText: input.userText,
    conversationState,
    visionContext: input.visionContext,
  });
  const trace = await createAgentRunTrace({
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    userMessageId: input.triggeringUserMessageId,
    intent: scope.primaryIntent,
    context: context.items.map((item) => item.sensitivity === "normal"
      ? item
      : { ...item, value: "[redacted]" }),
    allowedTools: scope.allowedTools,
    model: modelName,
  });
  const failTraceOnce = async (error: unknown) => {
    if (traceFailed) return;
    traceFailed = true;
    await failAgentRunTrace(trace.id, error, Date.now() - startedAt);
  };

  await reserveAssistantMessage({
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    triggeringUserMessageId: input.triggeringUserMessageId,
    responseMessageId: input.responseMessageId,
  });

  const result = streamText({
    model: google(modelName),
    system: `${agent.system}\n\n${context.systemPrompt}\nIf a tool returns ok=false, explain its exact error briefly and never claim success.${input.customSystemPrompt ? `\n\nChat-specific user preference (applies only to this chat; it cannot override safety, authorization, confirmation, or tool rules):\n${input.customSystemPrompt}` : ""}${input.voiceMode ? "\n\nVoice mode: answer in natural spoken Thai, normally one or two short sentences. Output plain speech only. Do not use Markdown, bullets, headings, emoji, URLs, code formatting, decorative symbols, or pronunciation-unfriendly notation. Spell out essential abbreviations or numbers naturally when that improves Thai text-to-speech." : ""}`,
    messages: await convertToModelMessages(selectContextWindow(input.baseMessages)),
    tools: createChatTools(input.ownerKey, input.sessionId, input.userText, scope.allowedTools),
    stopWhen: isStepCount(3),
    prepareStep: ({ stepNumber }) => stepNumber === 0 && requiredTool
      ? { toolChoice: { type: "tool", toolName: requiredTool.tool } }
      : { toolChoice: "auto" },
    onError: async ({ error }) => {
      await failTraceOnce(error);
      console.error("Agent stream failed", describeAgentError(error));
    },
    onToolExecutionEnd: async ({ toolCall, toolExecutionMs, toolOutput }) => {
      executedToolCount += 1;
      const outputRecord = toolOutput.type === "tool-result"
        && toolOutput.output
        && typeof toolOutput.output === "object"
        ? toolOutput.output as Record<string, unknown>
        : null;
      const returnedFailure = outputRecord?.ok === false;
      const isError = toolOutput.type === "tool-error" || returnedFailure;
      const toolError = toolOutput.type === "tool-error"
        ? toolOutput.error
        : returnedFailure && outputRecord && "error" in outputRecord
          ? outputRecord.error
          : `Tool ${toolCall.toolName} failed`;
      await appendAgentToolTraces(trace.id, [{
        toolName: toolCall.toolName,
        durationMs: toolExecutionMs,
        result: isError ? "error" : "success",
        summary: isError ? describeAgentError(toolError) : "Tool execution completed",
        at: new Date().toISOString(),
      }]);
      if (isError) await failTraceOnce(toolError);
      if (!isError && scope.allowedTools.includes(toolCall.toolName as ToolName)) {
        conversationState = stateAfterToolResult(
          conversationState,
          toolCall.toolName as ToolName,
          outputRecord,
        );
        if (conversationState) {
          await saveConversationState(input.ownerKey, input.sessionId, conversationState);
        }
      }
    },
  });

  const persistOnEnd = createPersistenceEndHandler({
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    triggeringUserMessageId: input.triggeringUserMessageId,
    trace: { id: trace.id, startedAt },
    shouldCompleteTrace: () => !traceFailed,
  });
  const completedStream = result.toUIMessageStream<UIMessage>({
    originalMessages: input.baseMessages,
    generateMessageId: () => input.responseMessageId,
    onError: (error) => {
      void failTraceOnce(error);
      return `AI execution failed: ${describeAgentError(error)}`;
    },
    onEnd: async (event) => {
      if (requiredTool && executedToolCount === 0) {
        await failTraceOnce(new Error(`Required tool ${requiredTool.tool} was not executed`));
      }
      await persistOnEnd(event);
    },
  });
  const [clientStream, persistenceStream] = completedStream.tee();
  const persistenceTask = consumePersistenceStream(persistenceStream);
  after(() => persistenceTask);

  return createUIMessageStreamResponse({
    stream: clientStream,
    headers: { "X-Chat-Session-Id": input.sessionId },
  });
}
