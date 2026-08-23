import { describe, expect, it } from "vitest";
import { retrieveToolNames } from "./toolRetrieval";

describe("tool retrieval", () => {
  it("selects only the relevant schedule operation", async () => {
    await expect(retrieveToolNames("ช่วยเพิ่มนัดพรุ่งนี้", ["getSchedule", "createScheduleItem"])).resolves.toContain("createScheduleItem");
  });

  it("does not select a web tool for ordinary reasoning", async () => {
    await expect(retrieveToolNames("ช่วยวิเคราะห์โค้ด TypeScript นี้", ["searchWeb", "fetchWebPage"])).resolves.toEqual([]);
  });

  it("never widens the allowlist", async () => {
    await expect(retrieveToolNames("ค้นเว็บข่าวล่าสุด", ["getSchedule"])).resolves.toEqual([]);
  });
});
