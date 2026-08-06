import { openai } from "@ai-sdk/openai";
import { createAgentConfig } from "@tinypersonal/assistant-core";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();
  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    ["schedule"],
  );

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4.1-mini"),
    system: agent.system,
    messages: convertToModelMessages(messages),
    tools: agent.tools,
  });

  return result.toUIMessageStreamResponse();
}
