import { createScheduleItemTool, getScheduleByRangeTool, updateScheduleStatusTool } from "./scheduleTools";
import { webScrapeTool, webSearchTool } from "./web";

/** The complete set of tools that may be exposed to the chat model. */
export const toolRegistry = {
  getSchedule: getScheduleByRangeTool,
  createScheduleItem: createScheduleItemTool,
  updateTaskStatus: updateScheduleStatusTool,
  searchWeb: webSearchTool,
  fetchWebPage: webScrapeTool,
};

export type ToolName = keyof typeof toolRegistry;

// Retrieval stays compact: schemas are attached only after a tool is selected.
export const toolCatalog: Record<ToolName, { description: string; keywords: string[] }> = {
  getSchedule: { description: "View appointments, tasks, routines, or calendar items in a date range.", keywords: ["schedule", "calendar", "agenda", "appointments", "tasks", "ตาราง", "ปฏิทิน", "นัด", "งานวันนี้"] },
  createScheduleItem: { description: "Create an appointment, event, task, reminder, or recurring routine.", keywords: ["create event", "add task", "schedule", "remind", "เพิ่มนัด", "สร้างงาน", "เตือน", "รูทีน"] },
  updateTaskStatus: { description: "Mark a task or schedule item pending, in progress, completed, or cancelled.", keywords: ["complete task", "task status", "done", "cancel task", "ทำเสร็จ", "สถานะงาน", "ยกเลิกงาน"] },
  searchWeb: { description: "Search for current external facts, recent news, prices, or live information.", keywords: ["latest", "current", "today", "news", "price", "search web", "ล่าสุด", "วันนี้", "ข่าว", "ราคา", "ค้นเว็บ"] },
  fetchWebPage: { description: "Read or summarize a specific public web page supplied by URL.", keywords: ["http", "https", "read page", "open url", "summarize link", "อ่านเว็บ", "เปิดลิงก์", "สรุปลิงก์"] },
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}
