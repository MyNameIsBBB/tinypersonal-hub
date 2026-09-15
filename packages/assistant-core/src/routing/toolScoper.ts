import type { ToolName } from "../tools/definitions";
import { routeTaskMessage } from "./taskRouting";

export type AgentDomain = "coding" | "schedule" | "notes" | "vault" | "web" | "memory" | "task";

export type AgentIntent =
  | "task.query"
  | "task.mutate"
  | "general.response"
  | "schedule.query"
  | "schedule.mutate"
  | "notes.query"
  | "notes.mutate"
  | "vault.query"
  | "vault.mutate"
  | "web.query"
  | "coding.response"
  | "memory.query";

export type ToolScope = {
  primaryIntent: AgentIntent;
  intents: AgentIntent[];
  allowedTools: ToolName[];
  confidence: number;
  matchedDomains: AgentDomain[];
};

export type RequiredToolCall = {
  tool: ToolName;
  reason: string;
  args?: Record<string, unknown>;
};

type RoutedCandidate = {
  intent: AgentIntent;
  domain: AgentDomain;
  score: number;
  tools: ToolName[];
};

const patterns = {
  schedule: /(?:schedule|calendar|event|appointment|routine|task|deadline|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ|พรุ่งนี้\s*มีอะไร|วันนี้\s*มีอะไร|งานล่าสุด|งานที่ยกเลิก.{0,20}(?:มีอะไร|ไหน)|เพิ่มเรียน|ส่ง\s*ผ้า|สรุป\s*งาน.{0,30}(?:สัปด(?:าห์|า)|อาทิตย์)|(?:สัปด(?:าห์|า)|อาทิตย์)(?:นี้|หน้า).{0,30}(?:มีอะไร|งาน|นัด|กำหนดการ|ทั้งหมด)|(?:ส่ง|รับ|คืน|ต้อง).{0,30}วันไหน|วันไหน.{0,30}(?:ส่ง|รับ|คืน|นัด))/iu,
  scheduleCreate: /(?:(?:create|add|new|สร้าง|เพิ่ม|บันทึก).{0,30}(?:schedule|calendar|event|appointment|routine|task|deadline|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ|เรียน)|(?:schedule|calendar|event|appointment|routine|task|deadline|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ).{0,30}(?:create|add|สร้าง|เพิ่ม|บันทึก))/iu,
  scheduleUpdate: /(?:(?:update|edit|change|rename|แก้ไข|เปลี่ยน|เลื่อน|อัปเดต).{0,30}(?:schedule|calendar|event|appointment|routine|task|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ)|(?:schedule|event|appointment|routine|task|นัด|รูทีน|กิจวัตร|กำหนดการ).{0,30}(?:ทำเสร็จ|เสร็จแล้ว))/iu,
  scheduleRemove: /(?:delete|remove|cancel|ลบ|ยกเลิก).{0,30}(?:schedule|calendar|event|appointment|routine|task|ตาราง|ปฏิทิน|นัด|รูทีน|กิจวัตร|กำหนดการ)/iu,
  notes: /(?:\bnotes?\b|โน้ต|บันทึกข้อความ)/iu,
  notesCreate: /(?:(?:create|add|save|new|สร้าง|เพิ่ม|บันทึก|จด|เก็บ).{0,24}(?:notes?|โน้ต|บันทึกข้อความ)|(?:notes?|โน้ต).{0,24}(?:create|add|save|สร้าง|เพิ่ม|บันทึก|จด|เก็บ)|^บันทึกข้อความ(?:ว่า|เรื่อง|:))/iu,
  notesUpdate: /(?:update|edit|change|rename|แก้ไข|เปลี่ยน|อัปเดต).{0,24}(?:notes?|โน้ต|บันทึก)/iu,
  notesRemove: /(?:delete|remove|ลบ|ยกเลิก).{0,24}(?:notes?|โน้ต|บันทึก)/iu,
  vault: /(?:\bvault\b|password|credential|totp|otp|รหัสผ่าน|ข้อมูลล็อกอิน|บัญชีเข้าสู่ระบบ)/iu,
  vaultCreate: /(?:create|add|save|new|สร้าง|เพิ่ม|บันทึก|เก็บ).{0,30}(?:vault|password|credential|totp|otp|รหัสผ่าน|ข้อมูลล็อกอิน|บัญชี)/iu,
  vaultUpdate: /(?:update|edit|change|rename|แก้ไข|เปลี่ยน|อัปเดต).{0,30}(?:vault|password|credential|รหัสผ่าน|ข้อมูลล็อกอิน|บัญชี|url)/iu,
  vaultRemove: /(?:delete|remove|ลบ|ยกเลิก).{0,30}(?:vault|password|credential|รหัสผ่าน|ข้อมูลล็อกอิน|บัญชี)/iu,
  web: /(?:https?:\/\/|search\s+(?:the\s+)?web|web\s+search|ค้น(?:หา)?\s*(?:เว็บ|อินเทอร์เน็ต)|หา\s*(?:ใน|จาก)\s*(?:เว็บ|อินเทอร์เน็ต)|ข่าวล่าสุด|ราคาล่าสุด)/iu,
  memory: /(?:จำได้ไหม|คุณจำ|จำเรื่อง|เกี่ยวกับ(?:ตัว)?ฉัน|เกี่ยวกับผม|ฉันชอบอะไร|ผมชอบอะไร|what do you remember about me|do you remember)/iu,
};

const codingSignals: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bcodex\b/iu, 0.55],
  [/\brepo(?:sitory)?\b/iu, 0.2],
  [/\bgit\b/iu, 0.55],
  [/\bbranch\b/iu, 0.5],
  [/\bcommit\b/iu, 0.5],
  [/\bcodebase\b/iu, 0.45],
  [/(?:\bfix\s+(?:the\s+)?tests?\b|แก้\s*test|แก้\s*เทสต์|รัน\s*test)/iu, 0.6],
  [/(?:deploy|build).{0,24}(?:project|app|service|โปรเจกต์|ระบบ|แอป)/iu, 0.65],
  [/(?:รัน\s*build|แก้(?:ไข)?\s*(?:ซอร์สโค้ด|โค้ด))/iu, 0.7],
  [/(?:ซอร์สโค้ด|โค้ด)/iu, 0.25],
];

const followUpPattern = /^(?:เอ้า|เอ่า|อ้าว|หาย|ลองใหม่|อีกครั้ง|เมื่อกี้|ต่อ(?:เลย)?|ได้ยัง|แล้วล่ะ|แล้วหรือยัง)/iu;

function clampConfidence(score: number) {
  return Math.min(Math.max(score, 0), 0.99);
}

function codingScore(text: string) {
  return clampConfidence(codingSignals.reduce(
    (score, [pattern, weight]) => score + (pattern.test(text) ? weight : 0),
    0,
  ));
}

function mutationIntent(
  text: string,
  domain: "schedule" | "notes" | "vault",
): { intent: AgentIntent; tools: ToolName[]; actionScore: number } {
  const getTool: Record<typeof domain, ToolName> = {
    schedule: "getSchedule",
    notes: "searchNotes",
    vault: "searchVaultMetadata",
  };
  const createTool: Record<typeof domain, ToolName> = {
    schedule: "createScheduleItem",
    notes: "createNote",
    vault: "createVaultSecret",
  };
  const updateTools: Record<typeof domain, ToolName[]> = {
    schedule: ["updateTaskStatus", "updateScheduleItem"],
    notes: ["updateNote"],
    vault: ["updateVaultMetadata"],
  };
  const removeTools: Record<typeof domain, ToolName[]> = {
    schedule: ["updateTaskStatus", "deleteRoutine"],
    notes: ["deleteNote"],
    vault: ["deleteVaultSecret"],
  };
  const create = patterns[`${domain}Create`].test(text);
  const update = patterns[`${domain}Update`].test(text);
  const remove = patterns[`${domain}Remove`].test(text);
  const tools = new Set<ToolName>([getTool[domain]]);
  if (create) tools.add(createTool[domain]);
  if (update) updateTools[domain].forEach((tool) => tools.add(tool));
  if (remove) removeTools[domain].forEach((tool) => tools.add(tool));
  return {
    intent: create || update || remove ? `${domain}.mutate` : `${domain}.query`,
    tools: [...tools],
    actionScore: create || update || remove ? 0.44 : 0,
  };
}

function collectCandidates(text: string): RoutedCandidate[] {
  const candidates: RoutedCandidate[] = [];
  for (const domain of ["schedule", "notes", "vault"] as const) {
    if (!patterns[domain].test(text)) continue;
    const routed = mutationIntent(text, domain);
    candidates.push({
      domain,
      intent: routed.intent,
      tools: routed.tools,
      score: clampConfidence(0.51 + routed.actionScore),
    });
  }
  if (patterns.web.test(text)) {
    const feedsNote = /(?:search\s+(?:the\s+)?web|ค้น(?:หา)?\s*(?:เว็บ|อินเทอร์เน็ต)|หา\s*(?:ใน|จาก)\s*(?:เว็บ|อินเทอร์เน็ต)).{0,60}(?:จด|บันทึก|เก็บ).{0,24}(?:notes?|โน้ต|บันทึก)/iu.test(text);
    candidates.push({
      domain: "web",
      intent: "web.query",
      tools: [/https?:\/\//iu.test(text) ? "fetchWebPage" : "searchWeb"],
      score: feedsNote ? 0.98 : /(?:search\s+(?:the\s+)?web|ค้น(?:หา)?\s*(?:เว็บ|อินเทอร์เน็ต)|หา\s*(?:ใน|จาก)\s*(?:เว็บ|อินเทอร์เน็ต))/iu.test(text) ? 0.9 : 0.75,
    });
  }
  if (patterns.memory.test(text)) {
    candidates.push({ domain: "memory", intent: "memory.query", tools: [], score: 0.85 });
  }
  const score = codingScore(text);
  if (score >= 0.45) {
    candidates.push({ domain: "coding", intent: "coding.response", tools: [], score });
  }
  const sorted = candidates.sort((left, right) => right.score - left.score);
  // An English workspace-domain word is often a code symbol (for example
  // "schedule service"). Do not expose live-data tools for that weak match.
  if (sorted[0]?.domain === "coding" && sorted[0].score >= 0.8) {
    return sorted.filter((candidate) => candidate.domain === "coding" || candidate.score > 0.51);
  }
  return sorted;
}

/** Deterministic, conservative fast-path routing. Unknown requests receive no tools. */
export function scopeToolsForMessage(message: string): ToolScope {
  const task = routeTaskMessage(message);
  if (task) return task;
  const text = message.trim();
  const candidates = collectCandidates(text);
  if (candidates.length === 0) {
    return {
      primaryIntent: "general.response",
      intents: ["general.response"],
      allowedTools: [],
      confidence: 0.5,
      matchedDomains: [],
    };
  }

  const allowedTools = new Set<ToolName>();
  for (const candidate of candidates) candidate.tools.forEach((tool) => allowedTools.add(tool));
  return {
    primaryIntent: candidates[0].intent,
    intents: candidates.map(({ intent }) => intent),
    allowedTools: [...allowedTools],
    confidence: candidates[0].score,
    matchedDomains: candidates.map(({ domain }) => domain),
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
export function requiredFirstTool(scope: ToolScope, message = ""): RequiredToolCall | null {
  if (scope.primaryIntent === "task.query") return scope.allowedTools.includes("getTaskFocus")
    ? { tool: "getTaskFocus", reason: "Read deterministic task priorities before answering", args: { range: "today" } }
    : { tool: "getTasks", reason: "Read fresh tasks before answering" };
  if (scope.primaryIntent === "task.mutate" && !scope.allowedTools.includes("createTask")) {
    return { tool: "getTasks", reason: "Resolve the task and checklist IDs before editing" };
  }
  if (scope.primaryIntent === "schedule.query") {
    return { tool: "getSchedule", reason: "Schedule answers require fresh backend data" };
  }
  if (scope.primaryIntent === "notes.query") {
    return { tool: "searchNotes", reason: "Note answers require fresh backend data" };
  }
  if (scope.primaryIntent === "vault.query") {
    return { tool: "searchVaultMetadata", reason: "Vault answers require fresh backend data" };
  }
  if (scope.primaryIntent === "web.query") {
    const url = message.match(/https?:\/\/[^\s]+/iu)?.[0];
    if (scope.allowedTools.includes("fetchWebPage")) {
      return {
        tool: "fetchWebPage",
        reason: "User supplied an explicit URL",
        ...(url ? { args: { url } } : {}),
      };
    }
    return { tool: "searchWeb", reason: "Web answers require a fresh search" };
  }
  return null;
}
