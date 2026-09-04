import { tool } from "ai";
import { delegateCodingTaskInputSchema, toolContracts } from "./definitions";

export { delegateCodingTaskInputSchema } from "./definitions";
export type { DelegateCodingTaskInput } from "./definitions";

export const delegateCodingTaskTool = tool({
  description: toolContracts.delegateCodingTask.description,
  inputSchema: delegateCodingTaskInputSchema,
  execute: async (input) => ({ ok: true as const, command: "coding.delegateTask" as const, input }),
});
