import { tool } from "ai";
import { z } from "zod";

export const webSearchTool = tool({
  description: "Search the public web for current information and return titles, URLs, and short snippets.",
  inputSchema: z.object({ query: z.string().trim().min(2).max(300), count: z.number().int().min(1).max(10).default(5) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "web.search" as const, input }),
});

export const webScrapeTool = tool({
  description: "Read the visible text of one public HTTP/HTTPS web page. Does not access private networks, scripts, files, or non-text content.",
  inputSchema: z.object({ url: z.string().url().max(2_000), maxCharacters: z.number().int().min(1_000).max(30_000).default(12_000) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "web.scrape" as const, input }),
});
