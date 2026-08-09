import { google } from "@ai-sdk/google";
import { createAgentConfigForRequest, LocalToolSearchProvider, type ToolSearchProvider } from "@tinypersonal/assistant-core";
import { createScheduleItem, getScheduleByRange, scrapeWebPage, searchNotes, searchToolVectors, searchVaultMetadata, searchWeb, updateNote, updateVaultMetadata } from "@tinypersonal/backend-api";
import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/serverAuth";
import { z } from "zod";

export const maxDuration = 30;

const CHAT_TTL_MS = 12 * 60 * 60 * 1000;
const CHAT_MAX_MESSAGES = 120;
const CHAT_MAX_SESSIONS = 200;
const MODEL_CONTEXT_MAX_MESSAGES = 32;
const MODEL_CONTEXT_MAX_CHARACTERS = 32_000;
const BANGKOK_OFFSET_HOURS = 7;

type ChatMemoryRecord = {
  messages: UIMessage[];
  updatedAt: number;
};

type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

const recurrenceFrequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

function defaultRoutineEndDate(start: Date, frequency: RecurrenceFrequency, interval: number): Date {
  const end = new Date(start);
  if (frequency === "YEARLY") {
    end.setUTCFullYear(end.getUTCFullYear() + Math.max(10, interval * 20));
    return end;
  }
  if (frequency === "MONTHLY") {
    end.setUTCMonth(end.getUTCMonth() + Math.max(24, interval * 120));
    return end;
  }
  if (frequency === "WEEKLY") {
    end.setUTCDate(end.getUTCDate() + Math.max(365, interval * 7 * 260));
    return end;
  }
  end.setUTCDate(end.getUTCDate() + Math.max(365, interval * 730));
  return end;
}

const scheduleCreateTool = tool({
  description: "Create a one-time event or a recurring routine (daily/weekly/monthly/yearly) when the user gives title and start date/time.",
  inputSchema: z.object({
    title: z.string().trim().min(1),
    startsAt: z.string().trim().min(1),
    isAllDay: z.boolean().default(false),
    durationMinutes: z.number().int().positive().max(24 * 60).default(30),
    recurrenceFrequency: recurrenceFrequencySchema.optional(),
    recurrenceInterval: z.number().int().min(1).max(120).default(1),
    recurrenceByDays: z.array(weekdaySchema).max(7).optional(),
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
  execute: async (input) => {
    const startTime = parseBangkokDateTimeInput(input.startsAt);
    const endTime = new Date(startTime.getTime() + input.durationMinutes * 60_000);
    const isRecurring = Boolean(input.recurrenceFrequency);
    const recurrenceRule = isRecurring ? JSON.stringify({
      frequency: input.recurrenceFrequency,
      interval: input.recurrenceInterval,
      ...(input.recurrenceByDays?.length ? { byDays: input.recurrenceByDays } : {}),
    }) : null;
    const routineEndDate = isRecurring
      ? (input.recurrenceEndsAt
        ? parseBangkokDateTimeInput(input.recurrenceEndsAt)
        : defaultRoutineEndDate(startTime, input.recurrenceFrequency!, input.recurrenceInterval))
      : null;

    if (routineEndDate && routineEndDate < startTime) {
      throw new Error("recurrenceEndsAt must not be before startsAt");
    }

    const item = await createScheduleItem({
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
    });

    return {
      status: "created" as const,
      item: {
        id: item.id,
        title: item.title,
        startTime: item.startTime?.toISOString() ?? null,
        endTime: item.endTime?.toISOString() ?? null,
      },
    };
  },
});

const webSearchExecutionTool = tool({
  description: "Search the public web for current information.",
  inputSchema: z.object({ query: z.string().trim().min(2).max(300), count: z.number().int().min(1).max(10).default(5) }).strict(),
  execute: async ({ query, count }) => {
    try { return { ok: true as const, results: await searchWeb(query, count) }; }
    catch (error) { return { ok: false as const, error: { code: "WEB_SEARCH_FAILED", message: error instanceof Error ? error.message : "Web search failed" } }; }
  },
});

const webScrapeExecutionTool = tool({
  description: "Read visible text from one public HTTP/HTTPS page with private-network protection.",
  inputSchema: z.object({ url: z.string().url().max(2_000), maxCharacters: z.number().int().min(1_000).max(30_000).default(12_000) }).strict(),
  execute: async ({ url, maxCharacters }) => {
    try { return { ok: true as const, page: await scrapeWebPage(url, maxCharacters) }; }
    catch (error) { return { ok: false as const, error: { code: "WEB_SCRAPE_FAILED", message: error instanceof Error ? error.message : "Web scrape failed" } }; }
  },
});

const notesSearchExecutionTool = tool({
  description: "Search and read authorized personal notes.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(300), limit: z.number().int().min(1).max(10).default(5) }).strict(),
  execute: async ({ query, limit }) => ({
    ok: true as const,
    notes: (await searchNotes(query, limit)).map((note) => ({
      id: note.id, title: note.title, content: note.content.slice(0, 4_000), contentTruncated: note.content.length > 4_000,
      tags: note.tags, folder: note.folder, scheduleItemId: note.scheduleItemId, updatedAt: note.updatedAt.toISOString(),
    })),
  }),
});

const notesUpdateExecutionTool = tool({
  description: "Update an existing personal note after identifying it by ID.",
  inputSchema: z.object({
    id: z.string().min(1), title: z.string().trim().min(1).max(200).optional(), content: z.string().max(100_000).optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(), folder: z.string().trim().max(160).nullable().optional(),
    scheduleItemId: z.string().min(1).nullable().optional(),
  }).strict(),
  execute: async ({ id, ...input }) => {
    const note = await updateNote(id, input);
    return { ok: true as const, note: { id: note.id, title: note.title, tags: note.tags, folder: note.folder, updatedAt: note.updatedAt.toISOString() } };
  },
});

const vaultSearchExecutionTool = tool({
  description: "Search safe vault metadata. Never returns passwords, OTP, ciphertext, or encryption fields.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  execute: async ({ query }) => ({ ok: true as const, records: await searchVaultMetadata(query) }),
});

const vaultUpdateExecutionTool = tool({
  description: "Update safe vault metadata only. Never reads or changes passwords or OTP.",
  inputSchema: z.object({
    id: z.string().min(1), serviceName: z.string().trim().min(1).max(160).optional(), category: z.string().trim().min(1).max(100).optional(),
    accountIdentifier: z.string().trim().min(1).max(320).optional(), url: z.string().url().max(2_000).nullable().optional(), notes: z.string().max(5_000).nullable().optional(),
  }).strict(),
  execute: async ({ id, ...input }) => ({ ok: true as const, record: await updateVaultMetadata(id, input) }),
});

const localToolProvider = new LocalToolSearchProvider();
const sqliteVectorProvider: ToolSearchProvider = {
  async search(query, documents, limit) {
    const [vectorHits, lexicalHits] = await Promise.all([
      searchToolVectors(query, documents, limit),
      localToolProvider.search(query, documents, limit),
    ]);
    const names = new Set(documents.map((document) => document.name));
    const scores = new Map<string, number>();
    for (const hit of vectorHits) scores.set(hit.name, hit.score);
    for (const hit of lexicalHits) scores.set(hit.name, Math.max(scores.get(hit.name) ?? 0, hit.score));
    return [...scores].flatMap(([name, score]) => names.has(name as (typeof documents)[number]["name"])
      ? [{ name: name as (typeof documents)[number]["name"], score }] : [])
      .sort((left, right) => right.score - left.score).slice(0, limit);
  },
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toBangkokWallClock(date: Date): Date {
  return new Date(date.getTime() + BANGKOK_OFFSET_HOURS * 60 * 60 * 1000);
}

function formatBangkokDateTime(date: Date): string {
  const local = toBangkokWallClock(date);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}

function parseBangkokDateTimeInput(raw: string): Date {
  const value = raw.trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - BANGKOK_OFFSET_HOURS,
      Number(minute),
      second ? Number(second) : 0,
      0,
    ));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("startsAt must be a valid datetime string");
  }
  return parsed;
}

function bangkokNowContext(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const localNow = formatter.format(now).replace(",", "");
  return `Current local datetime is ${localNow} in Asia/Bangkok (UTC+07:00). Interpret relative dates such as today/tomorrow using Asia/Bangkok.`;
}

declare global {
  var __tinypersonalChatMemory: Map<string, ChatMemoryRecord> | undefined;
}

function chatMemory(): Map<string, ChatMemoryRecord> {
  if (!globalThis.__tinypersonalChatMemory) {
    globalThis.__tinypersonalChatMemory = new Map<string, ChatMemoryRecord>();
  }
  return globalThis.__tinypersonalChatMemory;
}

function pruneExpired(memory: Map<string, ChatMemoryRecord>) {
  const now = Date.now();
  for (const [key, record] of memory.entries()) {
    if (now - record.updatedAt > CHAT_TTL_MS) {
      memory.delete(key);
    }
  }
}

function enforceSessionLimit(memory: Map<string, ChatMemoryRecord>) {
  if (memory.size <= CHAT_MAX_SESSIONS) return;

  const entriesByAge = [...memory.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt);
  const deleteCount = memory.size - CHAT_MAX_SESSIONS;
  for (let index = 0; index < deleteCount; index += 1) {
    const entry = entriesByAge[index];
    if (entry) {
      memory.delete(entry[0]);
    }
  }
}

function truncateMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= CHAT_MAX_MESSAGES) return messages;
  return messages.slice(-CHAT_MAX_MESSAGES);
}

function contextWindowMessages(messages: UIMessage[]): UIMessage[] {
  const selected: UIMessage[] = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0 && selected.length < MODEL_CONTEXT_MAX_MESSAGES; index -= 1) {
    const message = messages[index];
    const size = JSON.stringify(message).length;
    if (selected.length > 0 && characters + size > MODEL_CONTEXT_MAX_CHARACTERS) break;
    selected.unshift(message);
    characters += size;
  }
  return selected;
}

function latestUserText(messages: UIMessage[]): string {
  const message = [...messages].reverse().find((item) => item.role === "user");
  if (!message) return "";
  return message.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function resolveChatOwnerKey(request: Request): string | null {
  if (process.env.NODE_ENV !== "production" && !process.env.SESSION_SIGNING_KEY) {
    return "dev-shared";
  }

  const token = cookieValue(request, SESSION_COOKIE);
  try {
    if (!isValidSessionToken(token)) return null;
  } catch {
    return null;
  }

  const encodedUsername = token?.split(".")[0];
  if (!encodedUsername) return null;

  try {
    const username = Buffer.from(encodedUsername, "base64url").toString("utf8").trim().toLowerCase();
    return username ? `user:${username}` : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memory = chatMemory();
  pruneExpired(memory);
  enforceSessionLimit(memory);
  const record = memory.get(ownerKey);

  return Response.json(
    { messages: record?.messages ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memory = chatMemory();
  memory.delete(ownerKey);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ownerKey = resolveChatOwnerKey(request);
  if (!ownerKey) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json() as { messages?: UIMessage[]; voiceMode?: boolean };
  const memory = chatMemory();
  pruneExpired(memory);
  enforceSessionLimit(memory);

  const storedMessages = memory.get(ownerKey)?.messages ?? [];
  const incomingMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const baseMessages = truncateMessages(incomingMessages.length ? incomingMessages : storedMessages);
  const modelContextMessages = contextWindowMessages(baseMessages);
  memory.set(ownerKey, { messages: baseMessages, updatedAt: Date.now() });
  enforceSessionLimit(memory);

  const agent = await createAgentConfigForRequest(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    latestUserText(baseMessages),
    ["schedule", "web.search", "web.scrape", "notes.search", "notes.update", "vault.searchMetadata", "vault.updateMetadata"],
    { limit: 5, minimumScore: 0.08, provider: sqliteVectorProvider },
  );
  let context = "";
  if (agent.selectedToolNames.includes("schedule")) {
    try {
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + 14 * 86_400_000);
      const upcoming = await getScheduleByRange(now, rangeEnd);
      context = upcoming.length
        ? `Relevant schedule items (next 14 days, maximum 30):\n${upcoming.slice(0, 30).map((item) => {
          const when = item.startTime ? formatBangkokDateTime(item.startTime) : "unscheduled";
          const until = item.endTime ? formatBangkokDateTime(item.endTime) : "unscheduled";
          return `- [${item.type}] ${item.title} | status=${item.status} | start=${when} | end=${until}`;
        }).join("\n")}`
        : "No schedule items found in the next 14 days.";
    } catch {
      context = "Schedule context is currently unavailable.";
    }
  }
  const nowContext = bangkokNowContext(new Date());

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: `${agent.system}\n\n${nowContext}\nAlways interpret and answer date/time in Asia/Bangkok (UTC+07:00). Do not convert schedule times to UTC unless explicitly requested. When a supplied web tool is relevant, use it instead of claiming web access is unavailable. Use web.search for current information and web.scrape for a specific URL. If a tool returns ok=false, explain its exact error message briefly and never claim success. Vault tools may access metadata only and must never imply that passwords or OTP were read.\n\n${context}${payload.voiceMode ? "\n\nVoice mode: answer in Thai, naturally and very briefly (normally 1-2 sentences) unless essential detail is required." : ""}`,
    messages: await convertToModelMessages(modelContextMessages),
    tools: {
      ...(agent.selectedToolNames.includes("schedule") && { schedule: scheduleCreateTool }),
      ...(agent.selectedToolNames.includes("web.search") && { "web.search": webSearchExecutionTool }),
      ...(agent.selectedToolNames.includes("web.scrape") && { "web.scrape": webScrapeExecutionTool }),
      ...(agent.selectedToolNames.includes("notes.search") && { "notes.search": notesSearchExecutionTool }),
      ...(agent.selectedToolNames.includes("notes.update") && { "notes.update": notesUpdateExecutionTool }),
      ...(agent.selectedToolNames.includes("vault.searchMetadata") && { "vault.searchMetadata": vaultSearchExecutionTool }),
      ...(agent.selectedToolNames.includes("vault.updateMetadata") && { "vault.updateMetadata": vaultUpdateExecutionTool }),
    },
    // Allow follow-up model steps after tool output so responses do not stop at finishReason=tool-calls.
    stopWhen: isStepCount(5),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: baseMessages,
    onEnd: ({ isAborted, messages }) => {
      if (isAborted) return;
      const nextMessages = truncateMessages(messages as UIMessage[]);
      memory.set(ownerKey, { messages: nextMessages, updatedAt: Date.now() });
      enforceSessionLimit(memory);
    },
  });
}
