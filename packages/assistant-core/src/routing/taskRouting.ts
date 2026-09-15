import type { ToolName } from "../tools/definitions";
import type { ToolScope } from "./toolScoper";

export function taskScope(action: "query" | "create" | "update" | "remove", checklist = false): ToolScope {
  const writes: ToolName[] = action === "create" ? [checklist ? "addTaskChecklistItem" : "createTask"]
    : action === "update" ? [checklist ? "updateTaskChecklistItem" : "updateTask"]
    : action === "remove" ? [checklist ? "deleteTaskChecklistItem" : "deleteTask"] : [];
  const intent = action === "query" ? "task.query" : "task.mutate";
  const allowedTools: ToolName[] = action === "query"
    ? ["getTaskFocus", "getTasks", "getTask"]
    : action === "create" && !checklist ? writes : ["getTasks", "getTask", ...writes];
  return { primaryIntent: intent, intents: [intent], matchedDomains: ["task"], confidence: 0.96, allowedTools };
}

export function routeTaskMessage(message: string): ToolScope | null {
  // Explicit calendar and note operations retain ownership of titles/content.
  if (/^(?:ช่วย)?(?:เพิ่มนัด|สร้างนัด|เพิ่มกิจกรรม|จดโน้ต|สร้างโน้ต|แก้โค้ด|ส่ง.{0,20}ให้\s*Codex)/iu.test(message.trim())) return null;
  if (!/(?:\btasks?\b|checklist|เช็กลิสต์|รายการงาน|งาน.{0,25}(?:deadline|เดดไลน์|กำหนดส่ง)|วันนี้ควรทำอะไร|งานค้าง)/iu.test(message)) return null;
  const action = /^(?:ช่วย)?(?:จด|เพิ่ม|สร้าง|create|add)/iu.test(message.trim()) ? "create"
    : /^(?:ช่วย)?(?:ลบ|delete|remove)/iu.test(message.trim()) ? "remove"
    : /(?:เปลี่ยน|แก้ไข|อัปเดต|ทำ.{0,20}เสร็จ|เสร็จแล้ว|ติ๊ก|update|complete)/iu.test(message) ? "update" : "query";
  const scope = taskScope(action, /(?:checklist|เช็กลิสต์)/iu.test(message) && !/(?:จด|เพิ่ม|สร้าง)\s*task/iu.test(message));
  if (/วันนี้ควรทำอะไร/u.test(message)) {
    scope.intents.push("schedule.query"); scope.matchedDomains.push("schedule"); scope.allowedTools.push("getSchedule");
  }
  return scope;
}
