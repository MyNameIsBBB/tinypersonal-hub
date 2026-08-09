import { tool } from "ai";
import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });
const scheduleType = z.enum(["EVENT", "TASK", "ROUTINE"]);
const scheduleStatus = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const recurrenceRuleSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(120).default(1),
  byDays: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).max(7).optional(),
}).strict();

const createScheduleItemInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  type: scheduleType,
  startTime: isoDateTime.optional(),
  endTime: isoDateTime.optional(),
  isAllDay: z.boolean().default(false),
  status: scheduleStatus.default("PENDING"),
  priority: priority.default("MEDIUM"),
  recurrenceRule: recurrenceRuleSchema.optional(),
  routineEndDate: isoDateTime.optional(),
}).strict().superRefine((value, context) => {
  if (value.type === "ROUTINE" && !value.recurrenceRule) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceRule"], message: "Routine requires a recurrence rule" });
  }
  if (value.type === "ROUTINE" && !value.routineEndDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["routineEndDate"], message: "Routine requires an end date" });
  }
  if (value.startTime && value.endTime && value.endTime <= value.startTime) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "End time must be after start time" });
  }
});

export const createScheduleItemTool = tool({
  description: "Create a validated event, flexible task, or bounded recurring routine.",
  inputSchema: createScheduleItemInput,
  execute: async (input) => ({
    ok: true as const,
    command: "schedule.create" as const,
    input: {
      ...input,
      recurrenceRule: input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : undefined,
    },
  }),
});

export const getScheduleByRangeTool = tool({
  description: "Get tasks and expanded event/routine instances within an inclusive date range.",
  inputSchema: z.object({
    rangeStart: isoDateTime,
    rangeEnd: isoDateTime,
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "schedule.getByRange" as const, input }),
});

export const updateScheduleStatusTool = tool({
  description: "Update the status of a task or schedule item.",
  inputSchema: z.object({
    id: z.string().min(1),
    status: scheduleStatus,
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "schedule.updateStatus" as const, input }),
});

export const updateScheduleItemTool = tool({
  description: "Update the editable details of an existing event, task, or routine. A routine must keep a recurrence rule and end date.",
  inputSchema: z.object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    type: scheduleType.optional(),
    startTime: isoDateTime.nullable().optional(),
    endTime: isoDateTime.nullable().optional(),
    isAllDay: z.boolean().optional(),
    priority: priority.optional(),
    recurrenceRule: recurrenceRuleSchema.nullable().optional(),
    routineEndDate: isoDateTime.nullable().optional(),
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "schedule.update" as const, input }),
});

export const deleteScheduleItemTool = tool({
  description: "Permanently delete one schedule item. Ask the user for explicit confirmation first, then call with confirmed=true.",
  inputSchema: z.object({ id: z.string().min(1), confirmed: z.literal(true) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "schedule.delete" as const, input }),
});

export const deleteOrCancelRoutineTool = tool({
  description: "Cancel an entire routine or one generated occurrence. Ask the user for explicit confirmation first, then call with confirmed=true.",
  inputSchema: z.object({
    routineId: z.string().min(1),
    scope: z.enum(["ALL", "INSTANCE"]),
    instanceStartTime: isoDateTime.optional(),
    confirmed: z.literal(true),
  }).strict().superRefine((value, context) => {
    if (value.scope === "INSTANCE" && !value.instanceStartTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["instanceStartTime"],
        message: "instanceStartTime is required when cancelling one instance",
      });
    }
  }),
  execute: async (input) => ({ ok: true as const, command: "schedule.cancelRoutine" as const, input }),
});
