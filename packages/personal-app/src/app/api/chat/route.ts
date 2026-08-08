import { google } from "@ai-sdk/google";
import { createAgentConfig } from "@tinypersonal/assistant-core";
import { createScheduleItem, getScheduleByRange } from "@tinypersonal/backend-api";
import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { isValidSessionToken, SESSION_COOKIE } from "@/lib/serverAuth";
import { z } from "zod";

export const maxDuration = 30;

const CHAT_TTL_MS = 12 * 60 * 60 * 1000;
const CHAT_MAX_MESSAGES = 120;
const CHAT_MAX_SESSIONS = 200;
const BANGKOK_OFFSET_HOURS = 7;

type ChatMemoryRecord = {
  messages: UIMessage[];
  updatedAt: number;
};

const scheduleCreateTool = tool({
  description: "Create one schedule event when the user gives a title and start date/time.",
  inputSchema: z.object({
    title: z.string().trim().min(1),
    startsAt: z.string().trim().min(1),
    durationMinutes: z.number().int().positive().max(24 * 60).default(30),
  }).strict(),
  execute: async (input) => {
    const startTime = parseBangkokDateTimeInput(input.startsAt);

    const endTime = new Date(startTime.getTime() + input.durationMinutes * 60_000);
    const item = await createScheduleItem({
      title: input.title,
      description: null,
      type: "EVENT",
      startTime,
      endTime,
      isAllDay: false,
      status: "PENDING",
      priority: "MEDIUM",
      recurrenceRule: null,
      routineEndDate: null,
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
  memory.set(ownerKey, { messages: baseMessages, updatedAt: Date.now() });
  enforceSessionLimit(memory);

  let context = "No schedule context loaded.";
  try {
    const now = new Date();
    const rangeEnd = new Date(now.getTime() + 14 * 86_400_000);
    const upcoming = await getScheduleByRange(now, rangeEnd);
    context = upcoming.length
      ? `Upcoming schedule items (next 14 days):\n${upcoming.slice(0, 120).map((item) => {
        const when = item.startTime ? formatBangkokDateTime(item.startTime) : "unscheduled";
        const until = item.endTime ? formatBangkokDateTime(item.endTime) : "unscheduled";
        return `- [${item.type}] ${item.title} | status=${item.status} | start=${when} | end=${until} | timezone=Asia/Bangkok`;
      }).join("\n")}`
      : "No schedule items found in next 14 days.";
  } catch {
    context = "Schedule context unavailable right now. Continue answering normally and suggest retry for latest schedule insights.";
  }

  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    ["schedule"],
  );
  const nowContext = bangkokNowContext(new Date());

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: `${agent.system}\n\n${nowContext}\nAlways interpret and answer date/time in Asia/Bangkok (UTC+07:00). Do not convert schedule times to UTC unless explicitly requested.\n\n${context}${payload.voiceMode ? "\n\nVoice mode: answer in Thai, naturally and very briefly (normally 1-2 sentences) unless essential detail is required." : ""}`,
    messages: await convertToModelMessages(baseMessages),
    tools: {
      ...agent.tools,
      schedule: scheduleCreateTool,
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
