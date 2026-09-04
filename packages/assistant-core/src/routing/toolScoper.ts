import type { ToolName } from "../tools/definitions";

export type AgentIntent =
  | "general.response"
  | "schedule.query"
  | "schedule.mutate"
  | "notes.query"
  | "notes.mutate"
  | "vault.query"
  | "vault.mutate"
  | "web.query"
  | "coding.delegate"
  | "memory.query";

export type ToolScope = {
  primaryIntent: AgentIntent;
  intents: AgentIntent[];
  allowedTools: ToolName[];
  confidence: number;
  matchedDomains: string[];
};

const patterns = {
  coding: /(?:\bcodex\b|\brepo(?:sitory)?\b|\bgit\b|\bbranch\b|\bcommit\b|\bcodebase\b|\bdevops\b|\bdeploy\b|\bbuild\b|\bfix\s+(?:the\s+)?tests?\b|ซอร์สโค้ด|โค้ด|แก้\s*test|แก้\s*เทสต์|รัน\s*test)/iu,
  schedule: /(?:schedule|calendar|event|appointment|routine|task|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ|พรุ่งนี้\s*มีอะไร|วันนี้\s*มีอะไร|งานล่าสุด|เพิ่มเรียน|ส่ง\s*ผ้า|(?:ส่ง|รับ|คืน|ต้อง).{0,30}วันไหน|วันไหน.{0,30}(?:ส่ง|รับ|คืน|นัด))/iu,
  notes: /(?:\bnotes?\b|โน้ต|บันทึกข้อความ)/iu,
  vault: /(?:\bvault\b|password|credential|totp|otp|รหัสผ่าน|ข้อมูลล็อกอิน|บัญชีเข้าสู่ระบบ)/iu,
  web: /(?:https?:\/\/|search\s+(?:the\s+)?web|web\s+search|ค้น(?:หา)?\s*(?:เว็บ|อินเทอร์เน็ต)|หา\s*(?:ใน|จาก)\s*(?:เว็บ|อินเทอร์เน็ต)|ข่าวล่าสุด|ราคาล่าสุด)/iu,
  memory: /(?:จำได้ไหม|คุณจำ|จำเรื่อง|เกี่ยวกับ(?:ตัว)?ฉัน|เกี่ยวกับผม|ฉันชอบอะไร|ผมชอบอะไร|what do you remember about me|do you remember)/iu,
  create: /(?:\bcreate\b|\badd\b|\bsave\b|\bnew\b|สร้าง|เพิ่ม|บันทึก|เก็บ)/iu,
  update: /(?:\bupdate\b|\bedit\b|\bchange\b|\brename\b|แก้ไข|เปลี่ยน|เลื่อน|อัปเดต|ทำเสร็จ|เสร็จแล้ว)/iu,
  remove: /(?:\bdelete\b|\bremove\b|\bcancel\b|ลบ|ยกเลิก)/iu,
};

const followUpPattern = /^(?:เอ้า|เอ่า|อ้าว|หาย|ลองใหม่|อีกครั้ง|เมื่อกี้|ต่อ(?:เลย)?|ได้ยัง|แล้วล่ะ|แล้วหรือยัง)/iu;

function addUnique<T>(target: T[], values: T[]) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

/** Deterministic, conservative first-pass routing. Unknown requests receive no tools. */
export function scopeToolsForMessage(message: string): ToolScope {
  const text = message.trim();
  const intents: AgentIntent[] = [];
  const allowedTools: ToolName[] = [];
  const matchedDomains: string[] = [];
  const mutating = patterns.create.test(text) || patterns.update.test(text) || patterns.remove.test(text);

  if (patterns.coding.test(text)) {
    return {
      primaryIntent: "coding.delegate",
      intents: ["coding.delegate"],
      allowedTools: ["delegateCodingTask"],
      confidence: 0.95,
      matchedDomains: ["coding"],
    };
  }

  if (patterns.schedule.test(text)) {
    intents.push(mutating ? "schedule.mutate" : "schedule.query");
    matchedDomains.push("schedule");
    addUnique(allowedTools, ["getSchedule"]);
    if (patterns.create.test(text)) addUnique(allowedTools, ["createScheduleItem"]);
    if (patterns.update.test(text)) {
      addUnique(allowedTools, ["updateTaskStatus", "updateScheduleItem"]);
    }
    if (patterns.remove.test(text)) {
      addUnique(allowedTools, ["updateTaskStatus", "deleteRoutine"]);
    }
  }

  if (patterns.notes.test(text)) {
    intents.push(mutating ? "notes.mutate" : "notes.query");
    matchedDomains.push("notes");
    addUnique(allowedTools, ["searchNotes"]);
    if (patterns.create.test(text)) addUnique(allowedTools, ["createNote"]);
    if (patterns.update.test(text)) addUnique(allowedTools, ["updateNote"]);
    if (patterns.remove.test(text)) addUnique(allowedTools, ["deleteNote"]);
  }

  if (patterns.vault.test(text)) {
    intents.push(mutating ? "vault.mutate" : "vault.query");
    matchedDomains.push("vault");
    addUnique(allowedTools, ["searchVaultMetadata"]);
    if (patterns.create.test(text)) addUnique(allowedTools, ["createVaultSecret"]);
    if (patterns.update.test(text)) addUnique(allowedTools, ["updateVaultMetadata"]);
    if (patterns.remove.test(text)) addUnique(allowedTools, ["deleteVaultSecret"]);
  }

  if (patterns.web.test(text)) {
    intents.push("web.query");
    matchedDomains.push("web");
    if (/https?:\/\//iu.test(text)) addUnique(allowedTools, ["fetchWebPage"]);
    else addUnique(allowedTools, ["searchWeb"]);
  }

  if (patterns.memory.test(text)) {
    intents.push("memory.query");
    matchedDomains.push("memory");
  }

  if (intents.length === 0) intents.push("general.response");
  const confidence = matchedDomains.length === 0 ? 0.7 : matchedDomains.length === 1 ? 0.95 : 0.85;
  return {
    primaryIntent: intents[0],
    intents,
    allowedTools,
    confidence,
    matchedDomains,
  };
}

/** Inherit a recent domain only for an explicit short retry/follow-up utterance. */
export function scopeToolsForConversation(userMessages: string[]): ToolScope {
  const current = userMessages.at(-1)?.trim() ?? "";
  const direct = scopeToolsForMessage(current);
  if (direct.primaryIntent !== "general.response" || current.length > 80 || !followUpPattern.test(current)) {
    return direct;
  }
  for (let index = userMessages.length - 2; index >= 0; index -= 1) {
    const inherited = scopeToolsForMessage(userMessages[index]);
    if (inherited.primaryIntent !== "general.response") {
      return { ...inherited, confidence: Math.min(inherited.confidence, 0.8) };
    }
  }
  return direct;
}

/** Read intents require fresh backend data before the model may answer. */
export function requiredFirstTool(scope: ToolScope): ToolName | null {
  if (scope.primaryIntent === "schedule.query") return "getSchedule";
  if (scope.primaryIntent === "notes.query") return "searchNotes";
  if (scope.primaryIntent === "vault.query") return "searchVaultMetadata";
  if (scope.primaryIntent === "web.query") {
    return scope.allowedTools.includes("fetchWebPage") ? "fetchWebPage" : "searchWeb";
  }
  return null;
}
