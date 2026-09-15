import { tool } from "ai";
import { toolContracts, type ToolContract, type ToolName } from "./definitions";

function declarationTool(name: ToolName) {
  const contract: ToolContract = toolContracts[name];
  return tool({
    description: contract.description,
    inputSchema: contract.input,
    execute: async (input: unknown) => ({
      ok: true as const,
      command: contract.backendCommand,
      input,
    }),
  });
}

/** The complete set of tools that may be exposed to the chat model. */
export const toolRegistry = {
  getTaskFocus: declarationTool("getTaskFocus"),
  getTasks: declarationTool("getTasks"),
  getTask: declarationTool("getTask"),
  createTask: declarationTool("createTask"),
  updateTask: declarationTool("updateTask"),
  deleteTask: declarationTool("deleteTask"),
  addTaskChecklistItem: declarationTool("addTaskChecklistItem"),
  updateTaskChecklistItem: declarationTool("updateTaskChecklistItem"),
  deleteTaskChecklistItem: declarationTool("deleteTaskChecklistItem"),
  getSchedule: declarationTool("getSchedule"),
  createScheduleItem: declarationTool("createScheduleItem"),
  updateTaskStatus: declarationTool("updateTaskStatus"),
  updateScheduleItem: declarationTool("updateScheduleItem"),
  deleteRoutine: declarationTool("deleteRoutine"),
  searchWeb: declarationTool("searchWeb"),
  fetchWebPage: declarationTool("fetchWebPage"),
  searchNotes: declarationTool("searchNotes"),
  createNote: declarationTool("createNote"),
  updateNote: declarationTool("updateNote"),
  deleteNote: declarationTool("deleteNote"),
  searchVaultMetadata: declarationTool("searchVaultMetadata"),
  createVaultSecret: declarationTool("createVaultSecret"),
  updateVaultMetadata: declarationTool("updateVaultMetadata"),
  deleteVaultSecret: declarationTool("deleteVaultSecret"),
};

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}

export { toolContracts } from "./definitions";
export type { ToolContract, ToolName } from "./definitions";
