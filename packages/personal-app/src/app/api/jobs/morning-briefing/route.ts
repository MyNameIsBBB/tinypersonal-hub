import { google } from "@ai-sdk/google";
import { getMorningBriefingContext, resetAllGeneralChats, sendMorningNotification } from "@tinypersonal/backend-api";
import { generateText } from "ai";
import { timingSafeEqual } from "node:crypto";

export const maxDuration = 30;

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const context = await getMorningBriefingContext();
  const schedule = context.schedule.map((item) => ({ title: item.title, type: item.type, startTime: item.startTime?.toISOString() ?? null }));
  const { text } = await generateText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: "You are JARVIS. Write a concise Thai morning briefing, address the user as Sir, prioritize today's schedule, and never invent information. Use at most four short paragraphs.",
    prompt: JSON.stringify({ date: context.date, timezone: context.timezone, schedule, news: context.news, markets: context.markets }),
  });
  const message = text.trim();
  const generalChatsUpdated = await resetAllGeneralChats(message, context.date);
  const deliveries = await sendMorningNotification(message, `morning-briefing:${context.date}`);
  return Response.json({ ok: true, message, generalChatsUpdated, deliveries });
}
