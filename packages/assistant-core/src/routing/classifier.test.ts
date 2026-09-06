import { describe, expect, it } from "vitest";
import { scopeFromClassification } from "./classifier";

describe("classifier scope validation", () => {
  it("maps a classified schedule update to the minimum tool set", () => {
    expect(scopeFromClassification({
      domain: "schedule",
      action: "update",
      confidence: 0.86,
      reason: "References an existing appointment",
    }, "เลื่อนอันนั้น")).toMatchObject({
      primaryIntent: "schedule.mutate",
      allowedTools: ["getSchedule", "updateTaskStatus", "updateScheduleItem"],
      confidence: 0.86,
    });
  });

  it("never gives a general classification any tools", () => {
    expect(scopeFromClassification({
      domain: "general",
      action: "respond",
      confidence: 0.95,
      reason: "Greeting",
    }, "สวัสดี")).toMatchObject({ primaryIntent: "general.response", allowedTools: [] });
  });
});
