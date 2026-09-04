import { z, type ZodTypeAny } from "zod";

export type ToolContract<
  Name extends string = string,
  Input extends ZodTypeAny = ZodTypeAny,
> = {
  name: Name;
  description: string;
  input: Input;
  mutation: boolean;
  backendCommand: string;
};

export function defineTool<const Name extends string, Input extends ZodTypeAny>(
  contract: ToolContract<Name, Input>,
) {
  return contract;
}

const id = z.string().min(1);
const recurrenceFrequency = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const weekday = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

export const delegateCodingTaskInputSchema = z.object({
  instruction: z.string().max(20_000).refine(
    (value) => value.trim().length >= 3,
    "Instruction must contain at least 3 non-whitespace characters",
  ),
  readOnly: z.boolean().default(false).describe(
    "Set true for inspection, status, review, listing, or summarization tasks that must not change the repository.",
  ),
  branchName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/).optional(),
  autoPush: z.boolean().default(false),
}).strict().superRefine(({ readOnly, autoPush, branchName }, context) => {
  if (autoPush && !branchName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["branchName"],
      message: "branchName is required when autoPush is enabled",
    });
  }
  if (readOnly && (autoPush || branchName)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["readOnly"],
      message: "readOnly tasks cannot create a branch or push",
    });
  }
});

export type DelegateCodingTaskInput = z.infer<typeof delegateCodingTaskInputSchema>;

export const toolContracts = {
  getSchedule: defineTool({
    name: "getSchedule",
    description: "Get schedule items in an inclusive date range.",
    input: z.object({ rangeStart: z.string().trim().min(1), rangeEnd: z.string().trim().min(1) }).strict(),
    mutation: false,
    backendCommand: "schedule.getByRange",
  }),
  createScheduleItem: defineTool({
    name: "createScheduleItem",
    description: "Create a one-time event or a recurring routine (daily/weekly/monthly/yearly) when the user gives title and start date/time.",
    input: z.object({
      title: z.string().trim().min(1),
      startsAt: z.string().trim().min(1),
      isAllDay: z.boolean().default(false),
      durationMinutes: z.number().int().positive().max(24 * 60).default(30),
      recurrenceFrequency: recurrenceFrequency.optional(),
      recurrenceInterval: z.number().int().min(1).max(120).default(1),
      recurrenceByDays: z.array(weekday).max(7).optional(),
      recurrenceEndsAt: z.string().trim().min(1).optional(),
    }).strict().superRefine((value, context) => {
      if (value.recurrenceByDays?.length && value.recurrenceFrequency !== "WEEKLY") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recurrenceByDays"],
          message: "recurrenceByDays is only valid for WEEKLY recurrence",
        });
      }
    }),
    mutation: true,
    backendCommand: "schedule.create",
  }),
  updateTaskStatus: defineTool({
    name: "updateTaskStatus",
    description: "Change a task or schedule item's status after its ID is known.",
    input: z.object({
      id,
      status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
    }).strict(),
    mutation: true,
    backendCommand: "schedule.updateStatus",
  }),
  updateScheduleItem: defineTool({
    name: "updateScheduleItem",
    description: "Update an existing event, task, or routine in place. Use a root routine ID rather than an expanded occurrence ID. Changing only startsAt automatically preserves the existing duration.",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(300).optional(),
      startsAt: z.string().trim().min(1).optional(),
      endsAt: z.string().trim().min(1).optional(),
      recurrenceFrequency: recurrenceFrequency.optional(),
      recurrenceInterval: z.number().int().min(1).max(365).optional(),
      recurrenceByDays: z.array(weekday).max(7).optional(),
      recurrenceEndsAt: z.string().trim().min(1).optional(),
    }).strict(),
    mutation: true,
    backendCommand: "schedule.update",
  }),
  deleteRoutine: defineTool({
    name: "deleteRoutine",
    description: "Stop and remove an existing routine and all its future occurrences.",
    input: z.object({ id }).strict(),
    mutation: true,
    backendCommand: "schedule.deleteRoutine",
  }),
  searchWeb: defineTool({
    name: "searchWeb",
    description: "Search the public web for current information.",
    input: z.object({
      query: z.string().trim().min(2).max(300),
      count: z.number().int().min(1).max(10).default(5),
    }).strict(),
    mutation: false,
    backendCommand: "web.search",
  }),
  fetchWebPage: defineTool({
    name: "fetchWebPage",
    description: "Read visible text from one public HTTP/HTTPS page with private-network protection.",
    input: z.object({
      url: z.string().url().max(2_000),
      maxCharacters: z.number().int().min(1_000).max(30_000).default(12_000),
    }).strict(),
    mutation: false,
    backendCommand: "web.scrape",
  }),
  delegateCodingTask: defineTool({
    name: "delegateCodingTask",
    description: "Send the current user message directly to Codex. Every mutating coding task requires explicit confirmation before it is queued.",
    input: delegateCodingTaskInputSchema,
    mutation: true,
    backendCommand: "coding.delegateTask",
  }),
  searchNotes: defineTool({
    name: "searchNotes",
    description: "List or search the user's notes. Use an empty query to list all notes.",
    input: z.object({
      query: z.string().trim().max(300).default(""),
      limit: z.number().int().min(1).max(100).default(100),
    }).strict(),
    mutation: false,
    backendCommand: "notes.search",
  }),
  createNote: defineTool({
    name: "createNote",
    description: "Create a note after explicit confirmation. Never store credentials, passwords, OTP seeds, or recovery codes in notes.",
    input: z.object({
      title: z.string().trim().min(1).max(200),
      content: z.string().max(100_000),
      tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
      folder: z.string().trim().max(160).nullable().optional(),
      scheduleItemId: id.nullable().optional(),
    }).strict(),
    mutation: true,
    backendCommand: "notes.create",
  }),
  updateNote: defineTool({
    name: "updateNote",
    description: "Update a note after explicit confirmation. Never store credentials, passwords, OTP seeds, or recovery codes in notes.",
    input: z.object({
      id,
      title: z.string().trim().min(1).max(200).optional(),
      content: z.string().max(100_000).optional(),
      tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
      folder: z.string().trim().max(160).nullable().optional(),
      scheduleItemId: id.nullable().optional(),
    }).strict(),
    mutation: true,
    backendCommand: "notes.update",
  }),
  deleteNote: defineTool({
    name: "deleteNote",
    description: "Delete a note after explicit confirmation.",
    input: z.object({ id }).strict(),
    mutation: true,
    backendCommand: "notes.delete",
  }),
  searchVaultMetadata: defineTool({
    name: "searchVaultMetadata",
    description: "Search Vault metadata only. Never returns passwords, OTP seeds, ciphertext, IVs, or authentication tags.",
    input: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
    mutation: false,
    backendCommand: "vault.searchMetadata",
  }),
  createVaultSecret: defineTool({
    name: "createVaultSecret",
    description: "Create one encrypted Vault record for one account after explicit confirmation. Never repeat the password in the response and never store it in a note.",
    input: z.object({
      serviceName: z.string().trim().min(1).max(160),
      category: z.string().trim().min(1).max(100).default("Login"),
      accountIdentifier: z.string().trim().min(1).max(320),
      password: z.string().min(1).max(10_000),
      url: z.string().url().max(2_000).optional(),
      notes: z.string().max(5_000).optional(),
      totpSeed: z.string().max(2_000).optional(),
    }).strict(),
    mutation: true,
    backendCommand: "vault.create",
  }),
  updateVaultMetadata: defineTool({
    name: "updateVaultMetadata",
    description: "Update Vault metadata after explicit confirmation, without reading its secret.",
    input: z.object({
      id,
      serviceName: z.string().trim().min(1).max(160).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      accountIdentifier: z.string().trim().min(1).max(320).optional(),
      url: z.string().url().max(2_000).nullable().optional(),
      notes: z.string().max(5_000).nullable().optional(),
    }).strict(),
    mutation: true,
    backendCommand: "vault.updateMetadata",
  }),
  deleteVaultSecret: defineTool({
    name: "deleteVaultSecret",
    description: "Delete a Vault record after explicit confirmation without reading its secret.",
    input: z.object({ id }).strict(),
    mutation: true,
    backendCommand: "vault.delete",
  }),
} as const;

export type ToolName = keyof typeof toolContracts;
