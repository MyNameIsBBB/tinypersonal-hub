import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
export const idSchema = z.string().trim().min(1).max(191);
export const dateTimeSchema = z.string().datetime({ offset: true });
export const scheduleTypeSchema = z.enum(["EVENT", "TASK", "ROUTINE"]);
export const scheduleStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
export const schedulePrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const recurrenceRuleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]), interval: z.number().int().min(1).max(365),
  byDays: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).max(7).optional(),
}).strict();
export const scheduleCreateSchema = z.object({
  title: z.string().trim().min(1).max(300), description: nullableText(5_000).optional(), type: scheduleTypeSchema,
  startTime: dateTimeSchema.nullable().optional(), endTime: dateTimeSchema.nullable().optional(), isAllDay: z.boolean().optional(),
  priority: schedulePrioritySchema.optional(), recurrenceRule: z.union([recurrenceRuleSchema, z.string().max(1_000)]).nullable().optional(),
  routineEndDate: dateTimeSchema.nullable().optional(),
}).strict();
export const scheduleUpdateSchema = scheduleCreateSchema.partial().extend({ status: scheduleStatusSchema.optional() }).strict();
export const scheduleDeleteSchema = z.object({ mode: z.enum(["DELETE", "CANCEL"]).default("CANCEL"), scope: z.enum(["ALL", "INSTANCE"]).default("ALL"), instanceStartTime: dateTimeSchema.optional() }).strict();
export const noteCreateSchema = z.object({ title: z.string().trim().min(1).max(200), content: z.string().max(100_000), tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(), folder: nullableText(160).optional(), scheduleItemId: idSchema.nullable().optional() }).strict();
export const noteUpdateSchema = noteCreateSchema.partial().strict();
export const mediaLinksSchema = z.object({ noteId: idSchema.nullable().optional(), scheduleItemId: idSchema.nullable().optional() }).strict();
export const vaultCreateSchema = z.object({ serviceName: z.string().trim().min(1).max(160), category: z.string().trim().min(1).max(100), accountIdentifier: z.string().trim().min(1).max(320), password: z.string().min(1).max(10_000), url: z.string().url().max(2_000).optional().or(z.literal("")), notes: z.string().max(5_000).optional(), totpSeed: z.string().max(2_000).optional() }).strict();
export const vaultMetadataUpdateSchema = vaultCreateSchema.omit({ password: true, totpSeed: true }).partial().extend({ url: z.string().url().max(2_000).nullable().optional(), notes: z.string().max(5_000).nullable().optional() }).strict();
export const vaultRevealSchema = z.object({ password: z.string().min(1).max(10_000), reason: z.string().trim().min(3).max(500) }).strict();
export const loginSchema = z.object({ username: z.string().trim().min(1).max(320), password: z.string().min(1).max(10_000) }).strict();
export const browserVisionContextSchema = z.object({ currentUrl: z.string().url().max(2_000), title: z.string().trim().min(1).max(200) }).strict();
export const chatRequestSchema = z.object({ sessionId: idSchema.optional(), messages: z.array(z.unknown()).max(120).optional(), voiceMode: z.boolean().optional(), jarvisMode: z.boolean().optional(), visionContext: browserVisionContextSchema.optional() }).strict();
