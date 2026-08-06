import { BASE_SYSTEM_PROMPT, buildContextPrompt, type PromptContext } from "./prompts/base";
import { selectTools, type ToolName } from "./tools";

export function createAgentConfig(context: PromptContext, allowedTools: ToolName[]) {
  const contextPrompt = buildContextPrompt(context);

  return {
    system: [BASE_SYSTEM_PROMPT, contextPrompt].filter(Boolean).join("\n\n"),
    tools: selectTools(allowedTools),
  };
}
