import { describe, expect, it } from "vitest";
import { retrieveToolNames } from "./toolRetrieval";

describe("tool retrieval", () => {
  it("selects Thai schedule intent inside the allowlist", async () => {
    await expect(retrieveToolNames("ช่วยเพิ่มนัดพรุ่งนี้", ["schedule", "notes.search"])).resolves.toEqual(["schedule"]);
  });
  it("never widens authorization", async () => {
    await expect(retrieveToolNames("ค้นเว็บข่าวล่าสุด", ["notes.search"])).resolves.toEqual([]);
  });
  it("routes explicit Jarvis close commands", async () => {
    await expect(retrieveToolNames("ปิดหน้าจอทั้งหมด", ["openBrowserView", "closeBrowserView"])).resolves.toContain("closeBrowserView");
  });
});
