import { BASE_SYSTEM_PROMPT, buildContextPrompt, type PromptContext } from "./prompts/base";
import { selectTools, type ToolName } from "./tools";
import { retrieveToolNames, type RetrieveToolsOptions } from "./toolRetrieval";

export function createAgentConfig(context: PromptContext, allowedTools: ToolName[]) {
  const contextPrompt = buildContextPrompt(context);

  return {
    system: [BASE_SYSTEM_PROMPT, contextPrompt].filter(Boolean).join("\n\n"),
    tools: selectTools(allowedTools),
  };
}

export async function createAgentConfigForRequest(
  context: PromptContext,
  userRequest: string,
  allowedTools: ToolName[],
  retrievalOptions?: RetrieveToolsOptions,
) {
  const selectedToolNames = await retrieveToolNames(userRequest, allowedTools, retrievalOptions);
  const contextPrompt = buildContextPrompt(context);
  return {
    system: [BASE_SYSTEM_PROMPT, contextPrompt].filter(Boolean).join("\n\n"),
    tools: selectTools(selectedToolNames),
    selectedToolNames,
  };
}
