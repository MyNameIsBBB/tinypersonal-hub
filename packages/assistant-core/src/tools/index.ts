import {
  createScheduleItemTool,
  deleteScheduleItemTool,
  deleteOrCancelRoutineTool,
  getScheduleByRangeTool,
  updateScheduleItemTool,
  updateScheduleStatusTool,
} from "./scheduleTools";
import {
  createNoteTool, deleteMediaAssetTool, deleteNoteTool, deleteVaultSecretTool,
  listMediaAssetsTool, searchNotesTool, searchVaultMetadataTool, updateMediaAssetLinksTool,
  updateNoteTool, updateVaultMetadataTool,
} from "./knowledgeTools";

export const toolRegistry = {
  createScheduleItem: createScheduleItemTool,
  getScheduleByRange: getScheduleByRangeTool,
  updateScheduleStatus: updateScheduleStatusTool,
  updateScheduleItem: updateScheduleItemTool,
  deleteScheduleItem: deleteScheduleItemTool,
  deleteOrCancelRoutine: deleteOrCancelRoutineTool,
  createNote: createNoteTool,
  updateNote: updateNoteTool,
  deleteNote: deleteNoteTool,
  searchNotes: searchNotesTool,
  listMediaAssets: listMediaAssetsTool,
  updateMediaAssetLinks: updateMediaAssetLinksTool,
  deleteMediaAsset: deleteMediaAssetTool,
  searchVaultMetadata: searchVaultMetadataTool,
  updateVaultMetadata: updateVaultMetadataTool,
  deleteVaultSecret: deleteVaultSecretTool,
};

export type ToolName = keyof typeof toolRegistry;
export type ToolExecutor = (name: ToolName, input: unknown) => Promise<unknown>;

export function selectTools(allowed: ToolName[], executor?: ToolExecutor) {
  return Object.fromEntries(
    allowed.map((name) => {
      const selected = toolRegistry[name];
      return [name, executor ? { ...selected, execute: (input: unknown) => executor(name, input) } : selected];
    }),
  ) as Partial<typeof toolRegistry>;
}
