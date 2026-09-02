import { google } from "@ai-sdk/google";
import { getMorningBriefingContext, resetAllGeneralChats, sendMorningNotification } from "@tinypersonal/backend-api";
import { generateText } from "ai";
import { isCronAuthorizedRequest } from "@/lib/serverAuth";

export const maxDuration = 30;

function thaiFallback(context: Awaited<ReturnType<typeof getMorningBriefingContext>>): string {
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: context.timezone, dateStyle: "full" })
    .format(new Date(`${context.date}T12:00:00+07:00`));
  const schedule = context.schedule.length
    ? context.schedule.slice(0, 10).map((item) => {
        const time = item.startTime?.toLocaleTimeString("th-TH", { timeZone: context.timezone, hour: "2-digit", minute: "2-digit" }) ?? "ไม่ระบุเวลา";
        return `• ${time} น. ${item.title}`;
      }).join("\n")
    : "• วันนี้ยังไม่มีรายการในตาราง";
  const news = context.news.length
    ? `\n\nข่าวสำคัญ:\n${context.news.slice(0, 3).map(({ title }) => `• ${title}`).join("\n")}`
    : "";
  const markets = context.markets.length
    ? `\n\nภาพรวมตลาด:\n${context.markets.slice(0, 3).map(({ symbol, price, changePercent }) => `• ${symbol} ${price.toLocaleString("th-TH")} (${changePercent === null ? "ไม่มีข้อมูลการเปลี่ยนแปลง" : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`})`).join("\n")}`
    : "";
  return `สวัสดีตอนเช้าครับ วันนี้${date}\n\nตารางวันนี้:\n${schedule}${news}${markets}`;
}

export async function POST(request: Request) {
  if (!isCronAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const context = await getMorningBriefingContext();
  const schedule = context.schedule.map((item) => ({ title: item.title, type: item.type, startTime: item.startTime?.toISOString() ?? null }));
  const { text } = await generateText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: "เขียนสรุปเช้าภาษาไทยเท่านั้น ต้องขึ้นต้นว่า ‘สวัสดีตอนเช้าครับ’ ใช้วันเดือนแบบไทย ห้ามใช้ประโยคเปิดภาษาอังกฤษ ห้ามเรียกผู้ใช้ว่า Sir สรุปตารางวันนี้ก่อน แล้วจึงข่าวและตลาด ห้ามแต่งข้อมูล และใช้ไม่เกินสี่ย่อหน้าสั้น ๆ ชื่อวิชา ชื่อบุคคล และสัญลักษณ์หุ้นคงภาษาต้นฉบับได้",
    prompt: JSON.stringify({ date: context.date, timezone: context.timezone, schedule, news: context.news, markets: context.markets }),
  });
  const generated = text.trim();
  const message = generated.startsWith("สวัสดีตอนเช้าครับ") ? generated : thaiFallback(context);
  const generalChatsUpdated = await resetAllGeneralChats(message, context.date);
  const deliveries = await sendMorningNotification(message, `morning-briefing:${context.date}`);
  return Response.json({ ok: true, message, generalChatsUpdated, deliveries });
}
