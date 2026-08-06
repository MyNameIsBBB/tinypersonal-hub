import { google } from "@ai-sdk/google";
import { createAgentConfig } from "@tinypersonal/assistant-core";
import { getScheduleByRange } from "@tinypersonal/backend-api";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  let context = "No schedule context loaded.";
  try {
    const now = new Date();
    const rangeEnd = new Date(now.getTime() + 14 * 86_400_000);
    const upcoming = await getScheduleByRange(now, rangeEnd);
    context = upcoming.length
      ? `Upcoming schedule items (next 14 days):\n${upcoming.slice(0, 120).map((item) => {
        const when = item.startTime ? item.startTime.toISOString() : "unscheduled";
        return `- [${item.type}] ${item.title} | status=${item.status} | when=${when}`;
      }).join("\n")}`
      : "No schedule items found in next 14 days.";
  } catch {
    context = "Schedule context unavailable right now. Continue answering normally and suggest retry for latest schedule insights.";
  }

  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    ["schedule"],
  );

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: `${agent.system}\n\n${context}`,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
  });

  return result.toUIMessageStreamResponse();
}
