import { describe, expect, it } from "vitest";
import { controlSmartHomeDeviceInputSchema, delegateCodingTaskInputSchema } from "./jarvis";

describe("JARVIS tool contracts", () => {
  it("requires a branch before automatic push", () => {
    expect(delegateCodingTaskInputSchema.safeParse({ instruction: "Fix the failing test", autoPush: true }).success).toBe(false);
  });

  it("rejects shell-like branch names", () => {
    expect(delegateCodingTaskInputSchema.safeParse({ instruction: "Fix the test", branchName: "feature/x && whoami" }).success).toBe(false);
  });

  it("accepts repository inspection as read-only", () => {
    const result = delegateCodingTaskInputSchema.safeParse({ instruction: "Inspect repository status", readOnly: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.autoPush).toBe(false);
  });

  it("rejects branch mutations in read-only mode", () => {
    expect(delegateCodingTaskInputSchema.safeParse({ instruction: "Inspect repository", readOnly: true, branchName: "codex/inspect" }).success).toBe(false);
  });

  it("accepts a climate temperature service", () => {
    expect(controlSmartHomeDeviceInputSchema.safeParse({ domain: "climate", service: "set_temperature", entityId: "climate.living_room", payload: { temperature: 25 } }).success).toBe(true);
  });

  it("rejects incompatible domains and services", () => {
    expect(controlSmartHomeDeviceInputSchema.safeParse({ domain: "light", service: "set_temperature", entityId: "light.desk" }).success).toBe(false);
  });
});
