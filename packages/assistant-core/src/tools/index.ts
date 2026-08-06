import { scheduleTool } from "./schedule";

export const toolRegistry = {
  schedule: scheduleTool,
};

export type ToolName = keyof typeof toolRegistry;

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(
    allowed.map((name) => [name, toolRegistry[name]]),
  ) as Partial<typeof toolRegistry>;
}
