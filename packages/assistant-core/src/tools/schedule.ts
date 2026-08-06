import { tool } from "ai";
import { z } from "zod";

export const scheduleTool = tool({
  description: "Create a calendar item after the user has supplied a title and start time.",
  inputSchema: z.object({
    title: z.string().min(1),
    startsAt: z.string().datetime(),
    durationMinutes: z.number().int().positive().default(30),
  }),
  execute: async (input) => ({
    status: "queued" as const,
    operation: "create-calendar-item" as const,
    input,
  }),
});
