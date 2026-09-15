import { BASE_SYSTEM_PROMPT, buildContextPrompt, type PromptContext } from "./prompts/base";
import { selectTools, type ToolName } from "./tools";

export function createAgentConfig(context: PromptContext, allowedTools: ToolName[]) {
  const contextPrompt = buildContextPrompt(context);
  const toolScopePrompt = allowedTools.length
    ? `Tools available for this request: ${allowedTools.join(", ")}. Call only these tools.`
    : "No tools are available for this request. Answer without tools and never emit a function call.";

  return {
    system: [BASE_SYSTEM_PROMPT, contextPrompt, toolScopePrompt].filter(Boolean).join("\n\n"),
    tools: selectTools(allowedTools),
  };
}
