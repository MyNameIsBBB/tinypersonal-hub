import type { AgentEvalCase, AgentEvalObservation } from "./framework";

export const capabilityEvalCases: AgentEvalCase[] = [
  {
    id: "cap-schedule-read",
    prompt: "พรุ่งนี้มีอะไรบ้าง",
    expectedIntent: "schedule.query",
    expectedTools: ["getSchedule"],
    expectedCalls: [{
      toolName: "getSchedule",
      expectedArguments: { rangeStart: "2026-09-06T00:00:00+07:00", rangeEnd: "2026-09-06T23:59:59+07:00" },
    }],
  },
  {
    id: "cap-schedule-create",
    prompt: "เพิ่มเรียน ADT พรุ่งนี้ 9 โมง",
    expectedIntent: "schedule.mutate",
    expectedTools: ["getSchedule", "createScheduleItem"],
    expectedCalls: [{
      toolName: "createScheduleItem",
      expectedArguments: { title: "เรียน ADT", startsAt: "2026-09-06T09:00:00+07:00" },
    }],
  },
  {
    id: "cap-note-search",
    prompt: "หาโน้ต TinyPersonal",
    expectedIntent: "notes.query",
    expectedTools: ["searchNotes"],
    expectedCalls: [{ toolName: "searchNotes", expectedArguments: { query: "TinyPersonal" } }],
  },
  {
    id: "cap-note-delete",
    prompt: "ลบโน้ตทดสอบ id note-123",
    expectedIntent: "notes.mutate",
    expectedTools: ["searchNotes", "deleteNote"],
    expectedCalls: [{ toolName: "deleteNote", expectedArguments: { id: "note-123" } }],
  },
  {
    id: "cap-vault-search",
    prompt: "หารหัสผ่าน GitHub ใน vault",
    expectedIntent: "vault.query",
    expectedTools: ["searchVaultMetadata"],
    expectedCalls: [{ toolName: "searchVaultMetadata", expectedArguments: { query: "GitHub" } }],
  },
  {
    id: "cap-web-search",
    prompt: "ค้นเว็บข่าวล่าสุดเกี่ยวกับ TypeScript",
    expectedIntent: "web.query",
    expectedTools: ["searchWeb"],
    expectedCalls: [{ toolName: "searchWeb", expectedArguments: { query: "ข่าวล่าสุด TypeScript" } }],
  },
  {
    id: "cap-web-fetch",
    prompt: "อ่าน https://example.com",
    expectedIntent: "web.query",
    expectedTools: ["fetchWebPage"],
    expectedCalls: [{ toolName: "fetchWebPage", expectedArguments: { url: "https://example.com" } }],
  },
  {
    id: "cap-coding-unavailable",
    prompt: "ส่งงานตรวจ git status ให้ Codex",
    expectedIntent: "coding.response",
    expectedTools: [],
    expectedCalls: [],
  },
];

export const capabilityEvalObservations: AgentEvalObservation[] = [
  {
    caseId: "cap-schedule-read", actualIntent: "schedule.query", actualTools: ["getSchedule"],
    actualCalls: [{ toolName: "getSchedule", arguments: { rangeStart: "2026-09-06T00:00:00+07:00", rangeEnd: "2026-09-06T23:59:59+07:00" }, confirmationRequested: false, executionSucceeded: true }],
  },
  {
    caseId: "cap-schedule-create", actualIntent: "schedule.mutate", actualTools: ["getSchedule", "createScheduleItem"],
    actualCalls: [{ toolName: "createScheduleItem", arguments: { title: "เรียน ADT", startsAt: "2026-09-06T09:00:00+07:00" }, confirmationRequested: true, executionSucceeded: true }],
  },
  {
    caseId: "cap-note-search", actualIntent: "notes.query", actualTools: ["searchNotes"],
    actualCalls: [{ toolName: "searchNotes", arguments: { query: "TinyPersonal" }, confirmationRequested: false, executionSucceeded: true }],
  },
  {
    caseId: "cap-note-delete", actualIntent: "notes.mutate", actualTools: ["searchNotes", "deleteNote"],
    actualCalls: [{ toolName: "deleteNote", arguments: { id: "note-123" }, confirmationRequested: true, executionSucceeded: true }],
  },
  {
    caseId: "cap-vault-search", actualIntent: "vault.query", actualTools: ["searchVaultMetadata"],
    actualCalls: [{ toolName: "searchVaultMetadata", arguments: { query: "GitHub" }, confirmationRequested: false, executionSucceeded: true }],
  },
  {
    caseId: "cap-web-search", actualIntent: "web.query", actualTools: ["searchWeb"],
    actualCalls: [{ toolName: "searchWeb", arguments: { query: "ข่าวล่าสุด TypeScript" }, confirmationRequested: false, executionSucceeded: true }],
  },
  {
    caseId: "cap-web-fetch", actualIntent: "web.query", actualTools: ["fetchWebPage"],
    actualCalls: [{ toolName: "fetchWebPage", arguments: { url: "https://example.com" }, confirmationRequested: false, executionSucceeded: true }],
  },
  {
    caseId: "cap-coding-unavailable", actualIntent: "coding.response", actualTools: [],
    actualCalls: [],
  },
];
