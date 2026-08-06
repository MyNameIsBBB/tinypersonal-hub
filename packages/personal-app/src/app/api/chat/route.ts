import { google } from "@ai-sdk/google";
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
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: agent.system,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
  });

  return result.toUIMessageStreamResponse();
}
