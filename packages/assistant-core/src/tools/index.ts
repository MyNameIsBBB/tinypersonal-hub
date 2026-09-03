import { createScheduleItemTool, deleteOrCancelRoutineTool, getScheduleByRangeTool, updateScheduleItemTool, updateScheduleStatusTool } from "./scheduleTools";
import { webScrapeTool, webSearchTool } from "./web";
import { delegateCodingTaskTool } from "./jarvis";
import {
  createNoteTool, deleteNoteTool, deleteVaultSecretTool,
  searchNotesTool, searchVaultMetadataTool, updateNoteTool, updateVaultMetadataTool,
} from "./knowledgeTools";

/** The complete set of tools that may be exposed to the chat model. */
export const toolRegistry = {
  getSchedule: getScheduleByRangeTool,
  createScheduleItem: createScheduleItemTool,
  updateTaskStatus: updateScheduleStatusTool,
  updateRoutine: updateScheduleItemTool,
  deleteRoutine: deleteOrCancelRoutineTool,
  searchWeb: webSearchTool,
  fetchWebPage: webScrapeTool,
  delegateCodingTask: delegateCodingTaskTool,
  searchNotes: searchNotesTool,
  createNote: createNoteTool,
  updateNote: updateNoteTool,
  deleteNote: deleteNoteTool,
  searchVaultMetadata: searchVaultMetadataTool,
  updateVaultMetadata: updateVaultMetadataTool,
  deleteVaultSecret: deleteVaultSecretTool,
};

export type ToolName = keyof typeof toolRegistry;

export function selectTools(allowed: ToolName[]) {
  return Object.fromEntries(allowed.map((name) => [name, toolRegistry[name]])) as Partial<typeof toolRegistry>;
}
