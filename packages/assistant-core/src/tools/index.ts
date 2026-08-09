import { scheduleTool } from "./schedule";
import { webScrapeTool, webSearchTool } from "./web";

export const toolRegistry = {
  schedule: scheduleTool,
  "web.search": webSearchTool,
  "web.scrape": webScrapeTool,
};

export type ToolName = keyof typeof toolRegistry;

export const toolCatalog: Record<ToolName, { description: string; keywords: string[] }> = {
  schedule: {
    description: "Create, add, book, or schedule a calendar event, appointment, task, reminder, or routine with a date and time.",
    keywords: [
      "schedule", "calendar", "event", "appointment", "meeting", "reminder", "routine", "book",
      "ตาราง", "ปฏิทิน", "นัด", "ประชุม", "เตือน", "รูทีน", "กิจวัตร", "เพิ่มงาน", "สร้างงาน",
    ],
  },
  "web.search": {
    description: "Search the public internet for current, recent, latest, factual, news, product, price, documentation, or other web information.",
    keywords: ["search", "web", "internet", "latest", "current", "today", "news", "ค้นหา", "เสิร์ช", "เว็บ", "อินเทอร์เน็ต", "ล่าสุด", "วันนี้", "ข่าว"],
  },
  "web.scrape": {
    description: "Open, fetch, read, extract, or summarize text from a specific public web page or URL supplied by the user or returned by search.",
    keywords: ["scrape", "open url", "read page", "fetch page", "website", "http", "https", "อ่านเว็บ", "เปิดลิงก์", "สรุปลิงก์", "ดึงข้อมูลเว็บ"],
  },
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(
    allowed.map((name) => [name, toolRegistry[name]]),
  ) as Partial<typeof toolRegistry>;
}
