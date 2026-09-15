import {
  toolContracts,
  type ToolName,
} from "@tinypersonal/assistant-core";
import { tool } from "ai";
import { parseBangkokDateTimeInput } from "./contextBuilder";
import { createPendingAction } from "../../services/auditService";
import { getScheduleByRange, listActiveRoutines } from "../../services/scheduleService";
import { searchNotes } from "../../services/noteService";
import { searchVaultMetadata } from "../../services/vaultService";
import { searchWeb, scrapeWebPage } from "../../services/webService";
import { getTasks, getTask } from "../../services/taskService";
import { getTaskFocus } from "../../services/taskFocusService";

type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

function taskSummary(input: { title?: string; id?: string; taskId?: string }) {
  return input.title ?? input.id ?? input.taskId ?? "";
}

function taskCreateSummary(input: { title: string; deadline?: string | null; checklist?: string[] }) {
  return `สร้าง Task: ${input.title}${input.deadline ? ` — deadline ${input.deadline}` : ""}${input.checklist?.length ? ` — checklist ${input.checklist.length} ข้อ` : ""}`;
}

function parseRoutineEndInput(value: string): Date {
  return parseBangkokDateTimeInput(
    /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()} 23:59:59` : value
  );
}

function scheduleItemForModel(item: Awaited<ReturnType<typeof getScheduleByRange>>[number]) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    type: item.type,
    startTime: item.startTime?.toISOString() ?? null,
    endTime: item.endTime?.toISOString() ?? null,
    isAllDay: item.isAllDay,
    status: item.status,
    priority: item.priority,
    recurrenceRule: item.recurrenceRule,
    routineEndDate: item.routineEndDate?.toISOString() ?? null,
    parentRoutineId: item.parentRoutineId,
  };
}

function defaultRoutineEndDate(start: Date, frequency: RecurrenceFrequency, interval: number): Date {
  const end = new Date(start);
  if (frequency === "YEARLY") {
    end.setUTCFullYear(end.getUTCFullYear() + Math.max(10, interval * 20));
  } else if (frequency === "MONTHLY") {
    end.setUTCMonth(end.getUTCMonth() + Math.max(24, interval * 120));
  } else if (frequency === "WEEKLY") {
    end.setUTCDate(end.getUTCDate() + Math.max(365, interval * 7 * 260));
  } else {
    end.setUTCDate(end.getUTCDate() + Math.max(365, interval * 730));
  }
  return end;
}

function confirmationResult(action: { id: string; summary: string; expiresAt: Date }) {
  return {
    ok: true as const,
    confirmationRequired: true,
    confirmation: {
      id: action.id,
      summary: action.summary,
      expiresAt: action.expiresAt.toISOString(),
    },
  };
}

async function pendingResult(
  ownerKey: string,
  sessionId: string,
  toolName: string,
  summary: string,
  argumentsValue: unknown
) {
  return confirmationResult(
    await createPendingAction({
      ownerKey,
      sessionId,
      toolName,
      summary,
      arguments: argumentsValue,
    })
  );
}

function scheduleCreateTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.createScheduleItem.description,
    inputSchema: toolContracts.createScheduleItem.input,
    execute: async (input) => {
      const startTime = parseBangkokDateTimeInput(input.startsAt);
      const endTime = new Date(startTime.getTime() + input.durationMinutes * 60_000);
      const isRecurring = Boolean(input.recurrenceFrequency);
      const recurrenceRule = isRecurring
        ? JSON.stringify({
            frequency: input.recurrenceFrequency,
            interval: input.recurrenceInterval,
            ...(input.recurrenceByDays?.length ? { byDays: input.recurrenceByDays } : {}),
          })
        : null;
      const routineEndDate = isRecurring
        ? input.recurrenceEndsAt
          ? parseRoutineEndInput(input.recurrenceEndsAt)
          : defaultRoutineEndDate(startTime, input.recurrenceFrequency!, input.recurrenceInterval)
        : null;

      if (routineEndDate && routineEndDate < startTime) {
        throw new Error("recurrenceEndsAt must not be before startsAt");
      }

      const action = await createPendingAction({
        ownerKey,
        sessionId,
        toolName: "schedule.create",
        summary: `สร้าง ${isRecurring ? "Routine" : "Event"}: ${input.title}`,
        arguments: {
          title: input.title,
          description: null,
          type: isRecurring ? "ROUTINE" : "EVENT",
          startTime,
          endTime,
          isAllDay: input.isAllDay,
          status: "PENDING",
          priority: "MEDIUM",
          recurrenceRule,
          routineEndDate,
          parentRoutineId: null,
        },
      });
      return {
        status: "confirmation-required" as const,
        confirmation: {
          id: action.id,
          summary: action.summary,
          expiresAt: action.expiresAt.toISOString(),
        },
      };
    },
  });
}

const scheduleGetTool = tool({
  description: toolContracts.getSchedule.description,
  inputSchema: toolContracts.getSchedule.input,
  execute: async ({ rangeStart, rangeEnd }) => {
    const [items, routines] = await Promise.all([
      getScheduleByRange(parseBangkokDateTimeInput(rangeStart), parseBangkokDateTimeInput(rangeEnd)),
      listActiveRoutines(),
    ]);
    return {
      ok: true as const,
      items: items.slice(0, 100).map(scheduleItemForModel),
      routines: routines.slice(0, 50).map(scheduleItemForModel),
      truncated: items.length > 100 || routines.length > 50,
    };
  },
});

function scheduleStatusTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.updateTaskStatus.description,
    inputSchema: toolContracts.updateTaskStatus.input,
    execute: async (input) =>
      pendingResult(ownerKey, sessionId, "schedule.updateStatus", `อัปเดตสถานะงาน ${input.id} เป็น ${input.status}`, input),
  });
}

function scheduleUpdateTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.updateScheduleItem.description,
    inputSchema: toolContracts.updateScheduleItem.input,
    execute: async ({ id, startsAt, endsAt, recurrenceFrequency, recurrenceInterval, recurrenceByDays, recurrenceEndsAt, ...fields }) => {
      const recurrenceRule = recurrenceFrequency
        ? JSON.stringify({
            frequency: recurrenceFrequency,
            interval: recurrenceInterval ?? 1,
            ...(recurrenceByDays?.length ? { byDays: recurrenceByDays } : {}),
          })
        : undefined;
      const input = {
        ...fields,
        ...(startsAt ? { startTime: parseBangkokDateTimeInput(startsAt).toISOString() } : {}),
        ...(endsAt ? { endTime: parseBangkokDateTimeInput(endsAt).toISOString() } : {}),
        ...(recurrenceRule ? { recurrenceRule } : {}),
        ...(recurrenceEndsAt ? { routineEndDate: parseRoutineEndInput(recurrenceEndsAt).toISOString() } : {}),
      };
      return pendingResult(ownerKey, sessionId, "schedule.update", `แก้ไขกำหนดการ ${id}`, { id, ...input });
    },
  });
}

function routineDeleteTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.deleteRoutine.description,
    inputSchema: toolContracts.deleteRoutine.input,
    execute: async ({ id }) => pendingResult(ownerKey, sessionId, "schedule.deleteRoutine", `ลบ Routine ${id}`, { id }),
  });
}

const webSearchExecutionTool = tool({
  description: toolContracts.searchWeb.description,
  inputSchema: toolContracts.searchWeb.input,
  execute: async ({ query, count }) => {
    try {
      return { ok: true as const, results: await searchWeb(query, count) };
    } catch (error) {
      return {
        ok: false as const,
        error: { code: "WEB_SEARCH_FAILED", message: error instanceof Error ? error.message : "Web search failed" },
      };
    }
  },
});

const webScrapeExecutionTool = tool({
  description: toolContracts.fetchWebPage.description,
  inputSchema: toolContracts.fetchWebPage.input,
  execute: async ({ url, maxCharacters }) => {
    try {
      return { ok: true as const, page: await scrapeWebPage(url, maxCharacters) };
    } catch (error) {
      return {
        ok: false as const,
        error: { code: "WEB_SCRAPE_FAILED", message: error instanceof Error ? error.message : "Web scrape failed" },
      };
    }
  },
});

function noteItemForModel(note: Awaited<ReturnType<typeof searchNotes>>[number]) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags,
    folder: note.folder,
    scheduleItemId: note.scheduleItemId,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

const noteSearchExecutionTool = tool({
  description: toolContracts.searchNotes.description,
  inputSchema: toolContracts.searchNotes.input,
  execute: async ({ query, limit }) => ({
    ok: true as const,
    notes: (await searchNotes(query, limit)).map(noteItemForModel),
  }),
});

function createNoteTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.createNote.description,
    inputSchema: toolContracts.createNote.input,
    execute: async (input) => pendingResult(ownerKey, sessionId, "notes.create", `สร้าง Note: ${input.title}`, input),
  });
}

function updateNoteTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.updateNote.description,
    inputSchema: toolContracts.updateNote.input,
    execute: async (input) => pendingResult(ownerKey, sessionId, "notes.update", `แก้ไข Note ${input.id}`, input),
  });
}

function deleteNoteTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.deleteNote.description,
    inputSchema: toolContracts.deleteNote.input,
    execute: async ({ id }) => pendingResult(ownerKey, sessionId, "notes.delete", `ลบ Note ${id}`, { id }),
  });
}

function vaultRecordForModel(record: Awaited<ReturnType<typeof searchVaultMetadata>>[number]) {
  return {
    id: record.id,
    serviceName: record.serviceName,
    category: record.category,
    accountIdentifier: record.accountIdentifier,
    url: record.url,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function vaultCreateTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.createVaultSecret.description,
    inputSchema: toolContracts.createVaultSecret.input,
    execute: async (input) => {
      const action = await createPendingAction({
        ownerKey,
        sessionId,
        toolName: "vault.create",
        summary: `บันทึกบัญชี ${input.accountIdentifier} สำหรับ ${input.serviceName} ใน Vault`,
        arguments: input,
        sensitive: true,
      });
      return confirmationResult(action);
    },
  });
}

const vaultSearchExecutionTool = tool({
  description: toolContracts.searchVaultMetadata.description,
  inputSchema: toolContracts.searchVaultMetadata.input,
  execute: async ({ query }) => ({
    ok: true as const,
    records: (await searchVaultMetadata(query)).map(vaultRecordForModel),
  }),
});

function vaultUpdateTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.updateVaultMetadata.description,
    inputSchema: toolContracts.updateVaultMetadata.input,
    execute: async (input) => pendingResult(ownerKey, sessionId, "vault.updateMetadata", `แก้ไขข้อมูล Vault ${input.id}`, input),
  });
}

function vaultDeleteTool(ownerKey: string, sessionId: string) {
  return tool({
    description: toolContracts.deleteVaultSecret.description,
    inputSchema: toolContracts.deleteVaultSecret.input,
    execute: async ({ id }) => pendingResult(ownerKey, sessionId, "vault.delete", `ลบข้อมูล Vault ${id}`, { id }),
  });
}

export function createChatTools(
  ownerKey: string,
  sessionId: string,
  originalUserMessage: string,
  allowedTools: ToolName[]
) {
  const adapters = {
    getTaskFocus: tool({
      description: toolContracts.getTaskFocus.description,
      inputSchema: toolContracts.getTaskFocus.input,
      execute: async (input) => ({ ok: true as const, ...(await getTaskFocus(ownerKey, input)) }),
    }),
    getTasks: tool({
      description: toolContracts.getTasks.description,
      inputSchema: toolContracts.getTasks.input,
      execute: async (input) => ({ ok: true as const, tasks: await getTasks(ownerKey, input) }),
    }),
    getTask: tool({
      description: toolContracts.getTask.description,
      inputSchema: toolContracts.getTask.input,
      execute: async (input) => {
        const task = await getTask(ownerKey, input);
        return task
          ? { ok: true as const, tasks: [task] }
          : { ok: false as const, error: { code: "NOT_FOUND", message: "Task not found" } };
      },
    }),
    createTask: tool({
      description: toolContracts.createTask.description,
      inputSchema: toolContracts.createTask.input,
      execute: async (input) => pendingResult(ownerKey, sessionId, "task.create", taskCreateSummary(input), input),
    }),
    updateTask: tool({
      description: toolContracts.updateTask.description,
      inputSchema: toolContracts.updateTask.input,
      execute: async (input) => pendingResult(ownerKey, sessionId, "task.update", "แก้ไข Task: " + taskSummary(input), input),
    }),
    deleteTask: tool({
      description: toolContracts.deleteTask.description,
      inputSchema: toolContracts.deleteTask.input,
      execute: async (input) => pendingResult(ownerKey, sessionId, "task.delete", "ลบ Task: " + taskSummary(input), input),
    }),
    addTaskChecklistItem: tool({
      description: toolContracts.addTaskChecklistItem.description,
      inputSchema: toolContracts.addTaskChecklistItem.input,
      execute: async (input) =>
        pendingResult(ownerKey, sessionId, "task.checklist.add", "เพิ่ม Checklist: " + taskSummary(input), input),
    }),
    updateTaskChecklistItem: tool({
      description: toolContracts.updateTaskChecklistItem.description,
      inputSchema: toolContracts.updateTaskChecklistItem.input,
      execute: async (input) =>
        pendingResult(ownerKey, sessionId, "task.checklist.update", "แก้ไข Checklist: " + taskSummary(input), input),
    }),
    deleteTaskChecklistItem: tool({
      description: toolContracts.deleteTaskChecklistItem.description,
      inputSchema: toolContracts.deleteTaskChecklistItem.input,
      execute: async (input) =>
        pendingResult(ownerKey, sessionId, "task.checklist.delete", "ลบ Checklist: " + taskSummary(input), input),
    }),
    getSchedule: scheduleGetTool,
    createScheduleItem: scheduleCreateTool(ownerKey, sessionId),
    updateTaskStatus: scheduleStatusTool(ownerKey, sessionId),
    updateScheduleItem: scheduleUpdateTool(ownerKey, sessionId),
    deleteRoutine: routineDeleteTool(ownerKey, sessionId),
    searchWeb: webSearchExecutionTool,
    fetchWebPage: webScrapeExecutionTool,
    searchNotes: noteSearchExecutionTool,
    createNote: createNoteTool(ownerKey, sessionId),
    updateNote: updateNoteTool(ownerKey, sessionId),
    deleteNote: deleteNoteTool(ownerKey, sessionId),
    searchVaultMetadata: vaultSearchExecutionTool,
    createVaultSecret: vaultCreateTool(ownerKey, sessionId),
    updateVaultMetadata: vaultUpdateTool(ownerKey, sessionId),
    deleteVaultSecret: vaultDeleteTool(ownerKey, sessionId),
  };
  return Object.fromEntries(allowedTools.map((name) => [name, adapters[name]]));
}
