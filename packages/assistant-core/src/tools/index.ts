import { scheduleTool } from "./schedule";
import { webScrapeTool, webSearchTool } from "./web";
import { searchNotesTool, searchVaultMetadataTool, updateNoteTool, updateVaultMetadataTool } from "./knowledgeTools";

export const toolRegistry = {
  schedule: scheduleTool,
  "web.search": webSearchTool,
  "web.scrape": webScrapeTool,
  "notes.search": searchNotesTool,
  "notes.update": updateNoteTool,
  "vault.searchMetadata": searchVaultMetadataTool,
  "vault.updateMetadata": updateVaultMetadataTool,
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
  "notes.search": {
    description: "Find and read the user's authorized personal notes by title, content, tag, or folder.",
    keywords: ["note", "notes", "memo", "find note", "read note", "โน้ต", "บันทึก", "ค้นโน้ต", "ดูโน้ต", "อ่านโน้ต"],
  },
  "notes.update": {
    description: "Edit an existing personal note's title, Markdown content, tags, folder, or schedule link.",
    keywords: ["edit note", "update note", "change note", "แก้โน้ต", "แก้ไขโน้ต", "อัปเดตโน้ต", "เปลี่ยนโน้ต"],
  },
  "vault.searchMetadata": {
    description: "Find and view safe vault metadata such as service, account identifier, category, and URL without secrets, passwords, or OTP.",
    keywords: ["vault", "login", "account", "credential metadata", "คลังรหัส", "บัญชี", "ล็อกอิน", "ดู vault", "ค้น vault"],
  },
  "vault.updateMetadata": {
    description: "Edit safe vault metadata such as service, category, account identifier, URL, or notes without reading or changing passwords or OTP.",
    keywords: ["edit vault", "update vault", "change account metadata", "แก้ vault", "แก้ไข vault", "อัปเดต vault", "เปลี่ยนข้อมูลบัญชี"],
  },
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(
    allowed.map((name) => [name, toolRegistry[name]]),
  ) as Partial<typeof toolRegistry>;
}
