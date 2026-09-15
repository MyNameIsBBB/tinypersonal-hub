import { google } from "@ai-sdk/google";
import { getMorningBriefingContext, resetGeneralChat, sendMorningNotification, type TaskFocusItem } from "@tinypersonal/backend-api";
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
  const taskLine = (item: TaskFocusItem, index: number) => {
    const deadline = item.deadline ? new Intl.DateTimeFormat("th-TH", {
      timeZone: context.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    }).format(new Date(item.deadline)) : "ไม่มีกำหนดส่ง";
    const progress = item.checklist.total
      ? `${item.checklist.completed}/${item.checklist.total} · เหลือ ${item.checklist.remaining.join(", ") || "ครบแล้ว"}`
      : "ยังไม่มี checklist";
    return `${index + 1}. ${item.title}\n   ส่ง: ${deadline} · ${progress}`;
  };
  const tasks = context.taskFocus.recommended.length
    ? context.taskFocus.recommended.map(taskLine).join("\n")
    : "• ไม่มีงานค้าง";
  const warnings = context.taskFocus.overdue.length
    ? `\n\n⚠️ ต้องระวัง\n${context.taskFocus.overdue.map((item) => `• ${item.title} — overdue ${item.overdueDays} วัน`).join("\n")}`
    : "";
  const news = context.news.length
    ? `\n\nข่าวสำคัญ:\n${context.news.slice(0, 3).map(({ title }) => `• ${title}`).join("\n")}`
    : "";
  const markets = context.markets.length
    ? `\n\nภาพรวมตลาด:\n${context.markets.slice(0, 3).map(({ symbol, price, changePercent }) => `• ${symbol} ${price.toLocaleString("th-TH")} (${changePercent === null ? "ไม่มีข้อมูลการเปลี่ยนแปลง" : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`})`).join("\n")}`
    : "";
  return `สวัสดีตอนเช้าครับ วันนี้${date}\n\n📅 วันนี้\n${schedule}\n\n🎯 งานที่ควรจัดการ\n${tasks}${warnings}${news}${markets}`;
}

function configuredOwnerKey() {
  const username = process.env.APP_AUTH_USERNAME?.trim().toLowerCase();
  return username ? `user:${username}` : "dev-shared";
}

export async function POST(request: Request) {
  if (!isCronAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerKey = configuredOwnerKey();
  const context = await getMorningBriefingContext(ownerKey);
  const schedule = context.schedule.map((item) => ({ title: item.title, type: item.type, startTime: item.startTime?.toISOString() ?? null }));
  let generated = "";
  try {
    const result = await generateText({
      model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
      system: "เขียนสรุปเช้าภาษาไทยเท่านั้น ต้องขึ้นต้นว่า ‘สวัสดีตอนเช้าครับ’ และเรียงหัวข้อ 📅 วันนี้, 🎯 งานที่ควรจัดการ, ⚠️ ต้องระวัง (เฉพาะเมื่อมี overdue), 📰 ข่าวสำคัญ ใช้ลำดับ recommended จาก taskFocus ตามเดิมเพราะ backend คำนวณ priority แล้ว ระบุ deadline และ checklist progress อย่างกระชับ ห้ามคำนวณหรือจัดลำดับ priority ใหม่ ห้ามแต่งข้อมูล ห้ามเรียกผู้ใช้ว่า Sir ชื่อวิชา ชื่อบุคคล และสัญลักษณ์หุ้นคงภาษาต้นฉบับได้",
      prompt: JSON.stringify({ date: context.date, timezone: context.timezone, schedule, taskFocus: context.taskFocus, news: context.news, markets: context.markets }),
    });
    generated = result.text.trim();
  } catch {
    // The deterministic briefing remains useful when the language provider is unavailable.
  }
  const message = generated.startsWith("สวัสดีตอนเช้าครับ") && generated.includes("🎯 งานที่ควรจัดการ")
    ? generated : thaiFallback(context);
  const generalChatsUpdated = await resetGeneralChat(ownerKey, message, context.date);
  const deliveries = await sendMorningNotification(message, `morning-briefing:${ownerKey}:${context.date}`, ownerKey);
  return Response.json({ ok: true, message, generalChatsUpdated, deliveries });
}
