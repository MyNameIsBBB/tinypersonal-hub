import { createAgentConfigForRequest, LocalToolSearchProvider, type ToolName, type ToolSearchProvider } from "@tinypersonal/assistant-core";
import { searchToolVectors } from "@tinypersonal/backend-api";

const lexical = new LocalToolSearchProvider();
const provider: ToolSearchProvider = { async search(query, documents, limit) {
  const [vectors, words] = await Promise.all([searchToolVectors(query, documents, limit), lexical.search(query, documents, limit)]);
  const allowed = new Set(documents.map(({ name }) => name)); const scores = new Map<ToolName, number>();
  for (const hit of [...vectors, ...words]) { const name = hit.name as ToolName; if (allowed.has(name)) scores.set(name, Math.max(scores.get(name) ?? 0, hit.score)); }
  return [...scores].map(([name, score]) => ({ name, score })).sort((a, b) => b.score - a.score).slice(0, limit);
} };

export function selectAgentTools(userRequest: string, allowedTools: ToolName[]) {
  return createAgentConfigForRequest({ locale: "th-TH", timezone: "Asia/Bangkok" }, userRequest, allowedTools, { limit: 5, minimumScore: 0.08, provider });
}
