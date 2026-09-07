import { z } from "zod";

const id = z.string().trim().min(1).max(300);
export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"]);
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const fields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(20000).nullable().optional(),
  requirements: z.string().max(20000).nullable().optional(),
  status: taskStatusSchema.default("TODO"),
  priority: taskPrioritySchema.default("MEDIUM"),
  deadline: z.string().datetime({ offset: true }).nullable().optional().describe("ISO timestamp with timezone. If the user gives a date without a time, use 23:59 in Asia/Bangkok as the end-of-day deadline."),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  progressNote: z.string().max(5000).nullable().optional(),
};
export const taskCreateSchema = z.object({
  ...fields,
  checklist: z.array(z.string().trim().min(1).max(1000)).max(100).default([]),
}).strict();
export const taskUpdateSchema = z.object(fields).partial().extend({ id }).strict();
export const taskIdSchema = z.object({ id }).strict();
export const taskListSchema = z.object({
  query: z.string().trim().max(300).default(""),
  status: taskStatusSchema.optional(),
  unfinished: z.boolean().default(false),
  deadlineBefore: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
export const taskFocusSchema = z.object({
  range: z.enum(["today", "week"]).default("today"),
  limit: z.number().int().min(1).max(20).default(5),
}).strict();
export const checklistAddSchema = z.object({ taskId: id, title: z.string().trim().min(1).max(1000) }).strict();
export const checklistUpdateSchema = z.object({
  taskId: id, id,
  title: z.string().trim().min(1).max(1000).optional(),
  isCompleted: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
}).strict();
export const checklistDeleteSchema = z.object({ taskId: id, id }).strict();
