import { tool } from "ai";
import { z } from "zod";

export const delegateCodingTaskInputSchema = z.object({
  instruction: z.string().max(20_000).refine((value) => value.trim().length >= 3, "Instruction must contain at least 3 non-whitespace characters"),
  readOnly: z.boolean().default(false).describe("Set true for inspection, status, review, listing, or summarization tasks that must not change the repository."),
  branchName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/).optional(),
  autoPush: z.boolean().default(false),
}).strict().superRefine(({ readOnly, autoPush, branchName }, context) => {
  if (autoPush && !branchName) context.addIssue({ code: z.ZodIssueCode.custom, path: ["branchName"], message: "branchName is required when autoPush is enabled" });
  if (readOnly && (autoPush || branchName)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["readOnly"], message: "readOnly tasks cannot create a branch or push" });
});

export type DelegateCodingTaskInput = z.infer<typeof delegateCodingTaskInputSchema>;

export const delegateCodingTaskTool = tool({
  description: "Forward the user's current repository/code/build/test/Git/DevOps message directly to Codex. Copy the current user message verbatim into instruction; do not summarize or add instructions. Set readOnly=true only for inspection/status/summary tasks.",
  inputSchema: delegateCodingTaskInputSchema,
  execute: async (input) => ({ ok: true as const, command: "coding.delegate" as const, input }),
});
