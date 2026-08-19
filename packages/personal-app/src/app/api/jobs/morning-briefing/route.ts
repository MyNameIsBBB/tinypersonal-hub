import { google } from "@ai-sdk/google";
import { getMorningBriefingContext, sendMorningNotification } from "@tinypersonal/backend-api";
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
    system: "คุณคือผู้ช่วยส่วนตัว เขียน morning briefing ภาษาไทยสุภาพ เรียกผู้ใช้ว่า ‘พี่เบสท์’ สั้น กระชับไม่เกิน 4 ประโยค เลือกเฉพาะข่าวสำคัญที่สุด 1–2 ข่าวจาก JSON และห้ามแต่งข้อมูล หากไม่มีข่าวให้สรุปเฉพาะตารางงาน",
    prompt: JSON.stringify({ date: context.date, timezone: context.timezone, schedule, news: context.news, markets: context.markets }),
  });
  const message = text.trim();
  const deliveries = await sendMorningNotification(message, `morning-briefing:${context.date}`);
  if (!deliveries.length) return Response.json({ error: "No notification channel configured", message }, { status: 503 });
  return Response.json({ ok: deliveries.some((delivery) => delivery.ok), message, deliveries });
}
