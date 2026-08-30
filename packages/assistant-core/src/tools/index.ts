import { createScheduleItemTool, deleteOrCancelRoutineTool, getScheduleByRangeTool, updateScheduleItemTool, updateScheduleStatusTool } from "./scheduleTools";
import { webScrapeTool, webSearchTool } from "./web";
import { controlSmartHomeDeviceTool, delegateCodingTaskTool } from "./jarvis";

/** The complete set of tools that may be exposed to the chat model. */
export const toolRegistry = {
  getSchedule: getScheduleByRangeTool,
  createScheduleItem: createScheduleItemTool,
  updateTaskStatus: updateScheduleStatusTool,
  updateRoutine: updateScheduleItemTool,
  deleteRoutine: deleteOrCancelRoutineTool,
  searchWeb: webSearchTool,
  fetchWebPage: webScrapeTool,
  delegateCodingTask: delegateCodingTaskTool,
  controlSmartHomeDevice: controlSmartHomeDeviceTool,
};

export type ToolName = keyof typeof toolRegistry;

// Retrieval stays compact: schemas are attached only after a tool is selected.
export const toolCatalog: Record<ToolName, { description: string; keywords: string[] }> = {
  getSchedule: { description: "View appointments, tasks, routines, or calendar items in a date range.", keywords: ["schedule", "calendar", "agenda", "appointments", "tasks", "ตาราง", "ปฏิทิน", "นัด", "งานวันนี้"] },
  createScheduleItem: { description: "Create an appointment, event, task, reminder, or recurring routine.", keywords: ["create event", "add task", "schedule", "remind", "เพิ่มนัด", "สร้างงาน", "เตือน", "รูทีน"] },
  updateTaskStatus: { description: "Mark a task or schedule item pending, in progress, completed, or cancelled.", keywords: ["complete task", "task status", "done", "cancel task", "ทำเสร็จ", "สถานะงาน", "ยกเลิกงาน"] },
  updateRoutine: { description: "Edit an existing routine's title, time, recurrence, or end date.", keywords: ["edit routine", "update routine", "change routine", "แก้ routine", "เปลี่ยน routine", "วันสิ้นสุด routine"] },
  deleteRoutine: { description: "Delete or stop an existing recurring routine.", keywords: ["delete routine", "stop routine", "remove routine", "ลบ routine", "หยุด routine", "ยกเลิก routine"] },
  searchWeb: { description: "Search for current external facts, recent news, prices, or live information.", keywords: ["latest", "current", "today", "news", "price", "search web", "ล่าสุด", "วันนี้", "ข่าว", "ราคา", "ค้นเว็บ"] },
  fetchWebPage: { description: "Read or summarize a specific public web page supplied by URL.", keywords: ["http", "https", "read page", "open url", "summarize link", "อ่านเว็บ", "เปิดลิงก์", "สรุปลิงก์"] },
  delegateCodingTask: { description: "Run a local coding agent for a repository change, build it, and optionally push a branch.", keywords: ["code", "coding", "codex", "aider", "git status", "git branch", "implement", "refactor", "fix code", "แก้โค้ด", "เขียนโค้ด", "เช็ก git"] },
  controlSmartHomeDevice: { description: "Turn a Home Assistant light, switch, or climate device on or off, or set climate temperature.", keywords: ["home assistant", "light", "switch", "climate", "temperature", "air conditioner", "เปิดไฟ", "ปิดไฟ", "เปิดแอร์", "ปิดแอร์", "อุณหภูมิ"] },
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}
