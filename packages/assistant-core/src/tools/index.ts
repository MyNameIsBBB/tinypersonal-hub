import { createScheduleItemTool, deleteOrCancelRoutineTool, getScheduleByRangeTool, updateScheduleItemTool, updateScheduleStatusTool } from "./scheduleTools";
import { webScrapeTool, webSearchTool } from "./web";
import { controlSmartHomeDeviceTool, delegateCodingTaskTool } from "./jarvis";
import {
  createNoteTool, deleteNoteTool, deleteVaultSecretTool,
  searchNotesTool, searchVaultMetadataTool, updateNoteTool, updateVaultMetadataTool,
} from "./knowledgeTools";

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
  searchNotes: searchNotesTool,
  createNote: createNoteTool,
  updateNote: updateNoteTool,
  deleteNote: deleteNoteTool,
  searchVaultMetadata: searchVaultMetadataTool,
  updateVaultMetadata: updateVaultMetadataTool,
  deleteVaultSecret: deleteVaultSecretTool,
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
  delegateCodingTask: { description: "Let B1 delegate a concrete repository/code/build/test/Git/DevOps task to the local B1-DevOps Codex worker.", keywords: ["code", "coding", "codex", "devops", "worker", "delegate", "inspect repository", "inspect project", "summarize system", "git status", "git branch", "build", "test", "implement", "refactor", "fix code", "สั่ง worker", "สั่งงาน worker", "สั่ง codex", "ตรวจระบบ", "ตรวจโปรเจค", "ตรวจ repo", "inspect", "สรุประบบ", "สรุปโปรเจค", "แก้โค้ด", "เขียนโค้ด", "เช็ก git", "รันเทสต์", "build test"] },
  controlSmartHomeDevice: { description: "Turn a Home Assistant light, switch, or climate device on or off, or set climate temperature.", keywords: ["home assistant", "light", "switch", "climate", "temperature", "air conditioner", "เปิดไฟ", "ปิดไฟ", "เปิดแอร์", "ปิดแอร์", "อุณหภูมิ"] },
  searchNotes: { description: "Search notes by text, tag, or folder.", keywords: ["note", "notes", "find note", "ค้นโน้ต", "โน้ต"] },
  createNote: { description: "Create a new Markdown note.", keywords: ["create note", "add note", "บันทึกโน้ต", "สร้างโน้ต"] },
  updateNote: { description: "Update an existing note.", keywords: ["update note", "edit note", "แก้โน้ต"] },
  deleteNote: { description: "Delete an existing note after confirmation.", keywords: ["delete note", "remove note", "ลบโน้ต"] },
  searchVaultMetadata: { description: "Search safe Vault metadata without revealing secrets.", keywords: ["vault", "account", "login", "คลังรหัส", "บัญชี"] },
  updateVaultMetadata: { description: "Update safe Vault metadata without reading secrets.", keywords: ["update vault", "edit account", "แก้ vault", "แก้บัญชี"] },
  deleteVaultSecret: { description: "Delete a Vault record after confirmation without revealing it.", keywords: ["delete vault", "remove account", "ลบ vault", "ลบบัญชี"] },
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}
