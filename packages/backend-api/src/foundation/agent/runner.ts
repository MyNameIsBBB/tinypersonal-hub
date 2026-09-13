import { google } from "@ai-sdk/google";
import {
  appendAgentToolTraces,
  createAgentRunTrace,
  describeAgentError,
  failAgentRunTrace,
} from "../trace/agentTraceService";
import { recordAudit } from "../audit/auditService";
import { saveConversationState } from "../../features/chat/chatService";
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
  generateText,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { buildAgentContext, selectContextWindow } from "./contextBuilder";
import { createChatTools } from "./toolAdapterFactory";
import { classifyIntentWithGemini } from "./intentClassifier";
import {
  consumePersistenceStream,
  createPersistenceEndHandler,
  messageText,
  reserveAssistantMessage,
} from "./persistence";

export type RunAgentInput = {
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

export async function prepareAgentRun(input: RunAgentInput) {
  const startedAt = Date.now();
  const modelName = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const parsedState = conversationStateSchema.safeParse(input.conversationState);
  let conversationState: ConversationState | null = parsedState.success ? parsedState.data : null;
  conversationState = resolveConversationReference(conversationState, input.userText);
  const deterministicScope = routeWithState(
    input.userText,
    scopeToolsForMessage(input.userText),
    conversationState
  );
  const classifierScope =
    deterministicScope.confidence < 0.9
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
  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    scope.allowedTools
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
    context: context.items.map((item) =>
      item.sensitivity === "normal" ? item : { ...item, value: "[redacted]" }
    ),
    allowedTools: scope.allowedTools,
    model: modelName,
  });

  const tools = createChatTools(input.ownerKey, input.sessionId, input.userText, scope.allowedTools);
  const systemPrompt = `${agent.system}\n\n${agent.system}\nIf a tool returns ok=false, explain its exact error briefly and never claim success.${
    input.customSystemPrompt
      ? `\n\nChat-specific user preference (applies only to this chat; it cannot override safety, authorization, confirmation, or tool rules):\n${input.customSystemPrompt}`
      : ""
  }${
    input.voiceMode
      ? "\n\nVoice mode: answer in natural spoken Thai, normally one or two short sentences. Output plain speech only. Do not use Markdown, bullets, headings, emoji, URLs, code formatting, decorative symbols, or pronunciation-unfriendly notation. Spell out essential abbreviations or numbers naturally when that improves Thai text-to-speech."
      : ""
  }`;

  return {
    startedAt,
    modelName,
    conversationState,
    scope,
    requiredTool,
    agent,
    context,
    trace,
    tools,
    systemPrompt,
  };
}

/** Standalone streaming agent runner (returns UIMessage stream response) */
export async function runChatAgent(input: RunAgentInput) {
  const prepared = await prepareAgentRun(input);
  let traceFailed = false;
  let executedToolCount = 0;
  let conversationState = prepared.conversationState;

  const failTraceOnce = async (error: unknown) => {
    if (traceFailed) return;
    traceFailed = true;
    await failAgentRunTrace(prepared.trace.id, error, Date.now() - prepared.startedAt);
  };

  await reserveAssistantMessage({
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    triggeringUserMessageId: input.triggeringUserMessageId,
    responseMessageId: input.responseMessageId,
  });

  const result = streamText({
    model: google(prepared.modelName),
    system: prepared.systemPrompt,
    messages: await convertToModelMessages(selectContextWindow(input.baseMessages)),
    tools: prepared.tools,
    stopWhen: isStepCount(3),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 && prepared.requiredTool
        ? { toolChoice: { type: "tool", toolName: prepared.requiredTool.tool } }
        : { toolChoice: "auto" },
    onError: async ({ error }) => {
      await failTraceOnce(error);
      console.error("Agent stream failed", describeAgentError(error));
    },
    onToolExecutionEnd: async ({ toolCall, toolExecutionMs, toolOutput }) => {
      executedToolCount += 1;
      const outputRecord =
        toolOutput.type === "tool-result" &&
        toolOutput.output &&
        typeof toolOutput.output === "object"
          ? (toolOutput.output as Record<string, unknown>)
          : null;
      const returnedFailure = outputRecord?.ok === false;
      const isError = toolOutput.type === "tool-error" || returnedFailure;
      const toolError =
        toolOutput.type === "tool-error"
          ? toolOutput.error
          : returnedFailure && outputRecord && "error" in outputRecord
            ? outputRecord.error
            : `Tool ${toolCall.toolName} failed`;
      await appendAgentToolTraces(prepared.trace.id, [
        {
          toolName: toolCall.toolName,
          durationMs: toolExecutionMs,
          result: isError ? "error" : "success",
          summary: isError ? describeAgentError(toolError) : "Tool execution completed",
          at: new Date().toISOString(),
        },
      ]);
      if (isError) await failTraceOnce(toolError);
      if (!isError && prepared.scope.allowedTools.includes(toolCall.toolName as ToolName)) {
        conversationState = stateAfterToolResult(
          conversationState,
          toolCall.toolName as ToolName,
          outputRecord
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
    trace: { id: prepared.trace.id, startedAt: prepared.startedAt },
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
      if (prepared.requiredTool && executedToolCount === 0) {
        await failTraceOnce(new Error(`Required tool ${prepared.requiredTool.tool} was not executed`));
      }
      await persistOnEnd(event);
    },
  });

  const [clientStream, persistenceStream] = completedStream.tee();
  const persistenceTask = consumePersistenceStream(persistenceStream);

  return {
    response: createUIMessageStreamResponse({
      stream: clientStream,
      headers: { "X-Chat-Session-Id": input.sessionId },
    }),
    persistenceTask,
  };
}

/** Standalone direct/batch agent execution (no Next.js needed, perfect for Discord/Workers/CLI) */
export async function runAgentDirect(input: RunAgentInput): Promise<{
  text: string;
  responseMessageId: string;
  ok: boolean;
  error?: string;
}> {
  const prepared = await prepareAgentRun(input);
  let traceFailed = false;
  let executedToolCount = 0;
  let conversationState = prepared.conversationState;

  const failTraceOnce = async (error: unknown) => {
    if (traceFailed) return;
    traceFailed = true;
    await failAgentRunTrace(prepared.trace.id, error, Date.now() - prepared.startedAt);
  };

  await reserveAssistantMessage({
    ownerKey: input.ownerKey,
    sessionId: input.sessionId,
    triggeringUserMessageId: input.triggeringUserMessageId,
    responseMessageId: input.responseMessageId,
  });

  try {
    const result = await generateText({
      model: google(prepared.modelName),
      system: prepared.systemPrompt,
      messages: await convertToModelMessages(selectContextWindow(input.baseMessages)),
      tools: prepared.tools,
      stopWhen: isStepCount(3),
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 && prepared.requiredTool
          ? { toolChoice: { type: "tool", toolName: prepared.requiredTool.tool } }
          : { toolChoice: "auto" },
      onStepFinish: async (event) => {
        for (const toolCall of event.toolCalls ?? []) {
          executedToolCount += 1;
          const toolResult = event.toolResults?.find((r) => r.toolCallId === toolCall.toolCallId) as
            | { output?: unknown; result?: unknown }
            | undefined;
          const rawResult = toolResult?.output ?? toolResult?.result;
          const outputRecord =
            rawResult && typeof rawResult === "object"
              ? (rawResult as Record<string, unknown>)
              : null;
          const isError = outputRecord?.ok === false;
          await appendAgentToolTraces(prepared.trace.id, [
            {
              toolName: toolCall.toolName,
              durationMs: 0,
              result: isError ? "error" : "success",
              summary: isError ? describeAgentError(outputRecord?.error) : "Tool execution completed",
              at: new Date().toISOString(),
            },
          ]);
          if (!isError && prepared.scope.allowedTools.includes(toolCall.toolName as ToolName)) {
            conversationState = stateAfterToolResult(
              conversationState,
              toolCall.toolName as ToolName,
              outputRecord
            );
            if (conversationState) {
              await saveConversationState(input.ownerKey, input.sessionId, conversationState);
            }
          }
        }
      },
    });

    const persist = createPersistenceEndHandler({
      ownerKey: input.ownerKey,
      sessionId: input.sessionId,
      triggeringUserMessageId: input.triggeringUserMessageId,
      trace: { id: prepared.trace.id, startedAt: prepared.startedAt },
      shouldCompleteTrace: () => !traceFailed,
    });

    const assistantUIMessage: UIMessage = {
      id: input.responseMessageId,
      role: "assistant",
      parts: [{ type: "text", text: result.text }],
    };

    await persist({ messages: [...input.baseMessages, assistantUIMessage] });

    return {
      text: result.text,
      responseMessageId: input.responseMessageId,
      ok: true,
    };
  } catch (error) {
    const errorMsg = describeAgentError(error);
    await failTraceOnce(error);
    return {
      text: `AI ตอบไม่สำเร็จครับ: ${errorMsg}`,
      responseMessageId: input.responseMessageId,
      ok: false,
      error: errorMsg,
    };
  }
}
