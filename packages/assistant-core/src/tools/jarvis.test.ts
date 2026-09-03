import { describe, expect, it } from "vitest";
import { delegateCodingTaskInputSchema } from "./jarvis";

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

});
