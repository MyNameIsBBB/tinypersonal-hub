import { describe, expect, it } from "vitest";
import { buildTaskFocus, type TaskFocusSource } from "./taskFocusService";

const now = new Date("2026-09-07T03:00:00.000Z"); // 10:00 Asia/Bangkok
function task(overrides: Partial<TaskFocusSource> & Pick<TaskFocusSource, "id" | "title">): TaskFocusSource {
  return { status: "TODO", priority: "MEDIUM", deadline: null, progressNote: null, checklistItems: [], ...overrides };
}

describe("task focus priority engine", () => {
  it("classifies Bangkok deadlines and ranks overdue work first", () => {
    const focus = buildTaskFocus([
      task({ id: "later", title: "Later", priority: "HIGH", deadline: new Date("2026-09-10T16:59:00.000Z") }),
      task({ id: "today", title: "Today", deadline: new Date("2026-09-07T16:59:00.000Z") }),
      task({ id: "overdue", title: "Overdue", deadline: new Date("2026-09-05T16:59:00.000Z") }),
    ], now);

    expect(focus.overdue.map(({ id }) => id)).toEqual(["overdue"]);
    expect(focus.dueToday.map(({ id }) => id)).toEqual(["today"]);
    expect(focus.upcoming.map(({ id }) => id)).toEqual(["later"]);
    expect(focus.recommended[0]).toMatchObject({ id: "overdue", overdueDays: 2 });
  });

  it("includes priority, active status and checklist progress in one reusable result", () => {
    const focus = buildTaskFocus([task({
      id: "active", title: "Active", status: "IN_PROGRESS", priority: "URGENT",
      checklistItems: [
        { title: "done", isCompleted: true, order: 0 },
        { title: "test", isCompleted: false, order: 1 },
      ],
    })], now);

    expect(focus.recommended[0]).toMatchObject({
      id: "active", score: 57, reasons: ["priority", "in-progress"],
      checklist: { completed: 1, total: 2, remaining: ["test"] },
    });
    expect(focus.inProgress).toHaveLength(1);
  });
});
