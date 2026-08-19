import { tool } from "ai";
import { z } from "zod";

export const openBrowserViewTool = tool({
  description: "Open the Jarvis display workspace with a YouTube search or a public web URL.",
  inputSchema: z.object({
    actionType: z.enum(["YOUTUBE_SEARCH", "WEB_URL"]),
    queryOrUrl: z.string().trim().min(1).max(2_000),
    title: z.string().trim().min(1).max(200),
  }).strict(),
});

export const closeBrowserViewTool = tool({
  description: "Close the Jarvis display workspace when the user asks to close the screen, browser, or everything.",
  inputSchema: z.object({}).strict(),
});
