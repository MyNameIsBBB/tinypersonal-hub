import { describe, expect, it } from "vitest";
import { requiredFirstTool, scopeToolsForConversation, scopeToolsForMessage } from "./toolScoper";

describe("scopeToolsForMessage", () => {
  it.each([
    ["พรุ่งนี้มีอะไรบ้าง", "schedule.query", ["getSchedule"]],
    ["สรุป ตอนนี้เราต้องส่งผ้าวันไหนบ้าง", "schedule.query", ["getSchedule"]],
    ["ดูวันหน่อย สรุป เราต้องส่งผ้า วันไหนบ้าง", "schedule.query", ["getSchedule"]],
    ["เพิ่มเรียน ADT พรุ่งนี้ 9 โมง", "schedule.mutate", ["getSchedule", "createScheduleItem"]],
    ["เลื่อนนัดหมอเป็นบ่ายสอง", "schedule.mutate", ["getSchedule", "updateTaskStatus", "updateScheduleItem"]],
    ["ลบ routine ออก", "schedule.mutate", ["getSchedule", "updateTaskStatus", "deleteRoutine"]],
    ["หาโน้ต TinyPersonal", "notes.query", ["searchNotes"]],
    ["สร้างโน้ตเรื่อง architecture", "notes.mutate", ["searchNotes", "createNote"]],
    ["ดู password ของ GitHub ใน vault", "vault.query", ["searchVaultMetadata"]],
    ["ค้นเว็บข่าวล่าสุด", "web.query", ["searchWeb"]],
    ["อ่าน https://example.com", "web.query", ["fetchWebPage"]],
    ["ดู repo TinyRoom แล้วแก้ test ให้หน่อย", "coding.delegate", ["delegateCodingTask"]],
    ["อธิบาย dependency injection", "general.response", []],
    ["จำได้ไหมว่าผมชอบกาแฟแบบไหน", "memory.query", []],
  ] as const)("scopes %s", (message, intent, tools) => {
    const scope = scopeToolsForMessage(message);
    expect(scope.primaryIntent).toBe(intent);
    expect(scope.allowedTools).toEqual(tools);
  });

  it("unions tools for an explicit multi-domain request", () => {
    const scope = scopeToolsForMessage("หาโน้ตแผนเที่ยวแล้วค้นเว็บข่าวล่าสุดด้วย");
    expect(scope.intents).toEqual(["notes.query", "web.query"]);
    expect(scope.allowedTools).toEqual(["searchNotes", "searchWeb"]);
  });

  it("keeps source-code requests out of live workspace domains", () => {
    const scope = scopeToolsForMessage("แก้โค้ด schedule service ให้หน่อย");
    expect(scope.primaryIntent).toBe("coding.delegate");
    expect(scope.allowedTools).toEqual(["delegateCodingTask"]);
  });

  it("inherits the previous domain only for an explicit short retry", () => {
    expect(scopeToolsForConversation([
      "สรุป ตอนนี้เราต้องส่งผ้าวันไหนบ้าง",
      "เอ่า หาย",
    ])).toMatchObject({ primaryIntent: "schedule.query", allowedTools: ["getSchedule"], confidence: 0.8 });
    expect(scopeToolsForConversation(["พรุ่งนี้มีอะไร", "ขอบคุณครับ"]).primaryIntent).toBe("general.response");
  });

  it("requires fresh data for read intents but not general responses", () => {
    expect(requiredFirstTool(scopeToolsForMessage("สรุป ตอนนี้เราต้องส่งผ้าวันไหนบ้าง"))).toBe("getSchedule");
    expect(requiredFirstTool(scopeToolsForMessage("หาโน้ต TinyPersonal"))).toBe("searchNotes");
    expect(requiredFirstTool(scopeToolsForMessage("สวัสดี"))).toBeNull();
  });
});
