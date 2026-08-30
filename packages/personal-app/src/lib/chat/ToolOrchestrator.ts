import { createAgentConfigForRequest, type ToolName } from "@tinypersonal/assistant-core";

/** Lexical routing avoids a database/vector round trip and does not load schemas while selecting. */
export function selectAgentTools(userRequest: string, allowedTools: ToolName[]) {
  return createAgentConfigForRequest(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    userRequest,
    allowedTools,
    { limit: 8, minimumScore: 1 },
  );
}
