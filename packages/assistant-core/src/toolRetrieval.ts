import { toolCatalog, type ToolName } from "./tools";

export type ToolSearchDocument = {
  name: ToolName;
  text: string;
};

export type ToolSearchHit = {
  name: ToolName;
  score: number;
};

/** Adapter boundary for Pinecone, Qdrant, pgvector, or another vector store. */
export interface ToolSearchProvider {
  search(query: string, documents: ToolSearchDocument[], limit: number): Promise<ToolSearchHit[]>;
}

export type RetrieveToolsOptions = {
  limit?: number;
  provider?: ToolSearchProvider;
  minimumScore?: number;
};

function normalize(value: string): string {
  return value.toLocaleLowerCase("th-TH").normalize("NFKC");
}

function terms(value: string): string[] {
  return normalize(value).split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
}

export class LocalToolSearchProvider implements ToolSearchProvider {
  async search(query: string, documents: ToolSearchDocument[], limit: number): Promise<ToolSearchHit[]> {
    const normalizedQuery = normalize(query);
    const queryTerms = new Set(terms(query));
    return documents.map((document) => {
      const normalizedDocument = normalize(document.text);
      const documentTerms = new Set(terms(document.text));
      let score = 0;
      for (const term of queryTerms) {
        if (documentTerms.has(term)) score += 2;
        else if (normalizedDocument.includes(term)) score += 1;
      }
      for (const keyword of toolCatalog[document.name].keywords) {
        if (normalizedQuery.includes(normalize(keyword))) score += 4;
      }
      return { name: document.name, score };
    }).filter((hit) => hit.score > 0).sort((left, right) => right.score - left.score).slice(0, limit);
  }
}

export async function retrieveToolNames(
  query: string,
  allowedTools: ToolName[],
  options: RetrieveToolsOptions = {},
): Promise<ToolName[]> {
  if (!query.trim() || allowedTools.length === 0) return [];
  const limit = Math.max(1, Math.min(options.limit ?? 5, 5));
  const documents = allowedTools.map((name) => ({
    name,
    text: `${name} ${toolCatalog[name].description} ${toolCatalog[name].keywords.join(" ")}`,
  }));
  const hits = await (options.provider ?? new LocalToolSearchProvider()).search(query, documents, limit);
  const allowed = new Set(allowedTools);
  const minimumScore = options.minimumScore ?? 1;
  return hits.filter((hit) => allowed.has(hit.name) && hit.score >= minimumScore).map((hit) => hit.name);
}
