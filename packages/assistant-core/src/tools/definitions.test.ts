import { describe, expect, it } from "vitest";
import { toolContracts } from "./definitions";

describe("tool contracts", () => {
  it("keeps registry keys and public names aligned", () => {
    for (const [key, contract] of Object.entries(toolContracts)) {
      expect(contract.name).toBe(key);
      expect(contract.backendCommand.length).toBeGreaterThan(0);
      expect(contract.description.length).toBeGreaterThan(0);
    }
  });

  it("uses id consistently for mutation targets", () => {
    expect(toolContracts.updateTaskStatus.input.safeParse({
      id: "schedule-1",
      status: "COMPLETED",
    }).success).toBe(true);
    expect(toolContracts.updateTaskStatus.input.safeParse({
      eventId: "schedule-1",
      status: "COMPLETED",
    }).success).toBe(false);
    expect(toolContracts.deleteRoutine.input.safeParse({ id: "routine-1" }).success).toBe(true);
    expect(toolContracts.deleteRoutine.input.safeParse({ routineId: "routine-1" }).success).toBe(false);
  });

  it("marks every write contract as a mutation", () => {
    const expectedMutations = [
      "createTask",
      "updateTask",
      "deleteTask",
      "addTaskChecklistItem",
      "updateTaskChecklistItem",
      "deleteTaskChecklistItem",
      "createScheduleItem",
      "updateTaskStatus",
      "updateScheduleItem",
      "deleteRoutine",
      "createNote",
      "updateNote",
      "deleteNote",
      "createVaultSecret",
      "updateVaultMetadata",
      "deleteVaultSecret",
    ];

    expect(Object.entries(toolContracts)
      .filter(([, contract]) => contract.mutation)
      .map(([name]) => name)).toEqual(expectedMutations);
  });

  it("accepts one structured task creation with an embedded checklist", () => {
    expect(toolContracts.createTask.input.safeParse({
      title: "โปรเจกต์ EGAT",
      deadline: "2026-09-15T23:59:00+07:00",
      requirements: "infographic A4, architecture diagram และ prototype",
      checklist: ["แยก requirement", "ทำ UI", "test", "เตรียม present"],
    }).success).toBe(true);
  });
});
