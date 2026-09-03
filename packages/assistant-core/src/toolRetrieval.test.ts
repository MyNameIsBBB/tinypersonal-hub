import { describe, expect, it } from "vitest";
import { retrieveToolNames } from "./toolRetrieval";

describe("tool retrieval", () => {
  it("selects only the relevant schedule operation", async () => {
    await expect(retrieveToolNames("ช่วยเพิ่มนัดพรุ่งนี้", ["getSchedule", "createScheduleItem"])).resolves.toContain("createScheduleItem");
  });

  it("does not select a web tool for ordinary reasoning", async () => {
    await expect(retrieveToolNames("ช่วยวิเคราะห์โค้ด TypeScript นี้", ["searchWeb", "fetchWebPage"])).resolves.toEqual([]);
  });

  it("does not keep Codex routing sticky across independent messages", async () => {
    const allowed = ["delegateCodingTask", "getSchedule"] as const;
    await expect(retrieveToolNames("ให้ Codex รันเทสต์โปรเจกต์", [...allowed])).resolves.toContain("delegateCodingTask");
    await expect(retrieveToolNames("พรุ่งนี้ผมมีนัดอะไรบ้าง", [...allowed])).resolves.toEqual(["getSchedule"]);
  });

  it("never widens the allowlist", async () => {
    await expect(retrieveToolNames("ค้นเว็บข่าวล่าสุด", ["getSchedule"])).resolves.toEqual([]);
  });

  it("keeps note data operations in Workspace even if retrieval suggests Codex", async () => {
    const provider = { search: async () => [
      { name: "delegateCodingTask" as const, score: 10 },
      { name: "updateNote" as const, score: 8 },
    ] };
    await expect(retrieveToolNames(
      "\u0e41\u0e01\u0e49\u0e17\u0e38\u0e01\u0e42\u0e19\u0e4a\u0e15 \u0e40\u0e02\u0e35\u0e22\u0e19 Markdown \u0e2a\u0e27\u0e22\u0e46",
      ["delegateCodingTask", "updateNote", "searchNotes"],
      { provider },
    )).resolves.toEqual(["updateNote", "searchNotes"]);
  });

  it("selects routine lookup and mutation without unrelated tools", async () => {
    const allowed = ["getSchedule", "updateRoutine", "deleteRoutine", "searchWeb"] as const;
    await expect(retrieveToolNames("แก้วันสิ้นสุด routine", [...allowed])).resolves.toEqual(["updateRoutine", "getSchedule"]);
    await expect(retrieveToolNames("ลบ routine ออก", [...allowed])).resolves.toEqual(["deleteRoutine", "getSchedule"]);
  });
});
