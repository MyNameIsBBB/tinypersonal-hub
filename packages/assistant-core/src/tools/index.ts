import { createScheduleItemTool, deleteOrCancelRoutineTool, getScheduleByRangeTool, updateScheduleItemTool, updateScheduleStatusTool } from "./scheduleTools";
import { webScrapeTool, webSearchTool } from "./web";
import {
  createNoteTool, createVaultSecretTool, deleteNoteTool, deleteVaultSecretTool,
  searchNotesTool, searchVaultMetadataTool, updateNoteTool, updateVaultMetadataTool,
} from "./knowledgeTools";

/** The complete set of tools that may be exposed to the chat model. */
export const toolRegistry = {
  getSchedule: getScheduleByRangeTool,
  createScheduleItem: createScheduleItemTool,
  updateTaskStatus: updateScheduleStatusTool,
  updateScheduleItem: updateScheduleItemTool,
  deleteRoutine: deleteOrCancelRoutineTool,
  searchWeb: webSearchTool,
  fetchWebPage: webScrapeTool,
  searchNotes: searchNotesTool,
  createNote: createNoteTool,
  updateNote: updateNoteTool,
  deleteNote: deleteNoteTool,
  searchVaultMetadata: searchVaultMetadataTool,
  createVaultSecret: createVaultSecretTool,
  updateVaultMetadata: updateVaultMetadataTool,
  deleteVaultSecret: deleteVaultSecretTool,
};

export type ToolName = keyof typeof toolRegistry;

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}
