import { describe, expect, it } from "vitest";
import { expandRoutineInstances, parseRecurrenceRule, type ScheduleItem } from "./scheduleService";

const routine: ScheduleItem = { id: "routine", title: "Run", description: null, type: "ROUTINE", startTime: new Date("2026-08-17T00:00:00Z"), endTime: new Date("2026-08-17T01:00:00Z"), isAllDay: false, status: "PENDING", priority: "MEDIUM", recurrenceRule: JSON.stringify({ frequency: "WEEKLY", interval: 1, byDays: ["MO", "WE"] }), routineEndDate: new Date("2026-08-31T23:59:59Z"), parentRoutineId: null, createdAt: new Date(0), updatedAt: new Date(0) };

describe("routine expansion", () => {
  it("parses RRULE and JSON", () => {
    expect(parseRecurrenceRule("RRULE:FREQ=DAILY;INTERVAL=2")).toMatchObject({ frequency: "DAILY", interval: 2 });
  });
  it("expands selected weekdays and preserves duration", () => {
    const instances = expandRoutineInstances(routine, new Date("2026-08-17T00:00:00Z"), new Date("2026-08-24T23:59:59Z"));
    expect(instances.map((item) => item.startTime?.toISOString())).toEqual(["2026-08-17T00:00:00.000Z", "2026-08-19T00:00:00.000Z", "2026-08-24T00:00:00.000Z"]);
    expect(instances[0].endTime?.getTime()! - instances[0].startTime?.getTime()!).toBe(3_600_000);
  });
});
