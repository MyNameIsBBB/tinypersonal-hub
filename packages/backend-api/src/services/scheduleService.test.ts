import { describe, expect, it, vi } from "vitest";
import { prisma } from "../db/client";
import { expandRoutineInstances, parseRecurrenceRule, updateScheduleItem, type ScheduleItem } from "./scheduleService";

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

describe("schedule updates", () => {
  it("moves an item in place and preserves its duration", async () => {
    const current = { ...routine, id: "event", type: "EVENT", recurrenceRule: null, routineEndDate: null } as const;
    const find = vi.spyOn(prisma.scheduleItem, "findUniqueOrThrow").mockResolvedValue(current as never);
    const update = vi.spyOn(prisma.scheduleItem, "update").mockImplementation((async ({ data }: any) => ({ ...current, ...data })) as any);

    const moved = await updateScheduleItem("event", { startTime: new Date("2026-08-17T03:00:00Z") });

    expect(moved.id).toBe("event");
    expect(moved.endTime?.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "event" } }));
    find.mockRestore();
    update.mockRestore();
  });
});
