import { google, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { createAgentConfig } from "@tinypersonal/assistant-core";
import {
  createNote, createScheduleItem, deleteMediaAsset, deleteNote, deleteOrCancelRoutine,
  deleteScheduleItem, deleteVaultSecret, getScheduleByRange, listMediaAssets, searchNotes,
  searchVaultMetadata, updateMediaAssetLinks, updateNote, updateScheduleItem,
  updateScheduleStatus, updateVaultMetadata,
} from "@tinypersonal/backend-api";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export const maxDuration = 60;

type Input = Record<string, unknown>;
const text = (input: Input, key: string) => typeof input[key] === "string" ? input[key] : undefined;
const nullableText = (input: Input, key: string) => input[key] === null ? null : text(input, key);
const requireConfirmation = (input: Input) => {
  if (input.confirmed !== true) throw new Error("Explicit confirmation is required");
};

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { messages }: { messages: UIMessage[] } = await request.json();
  const agent = createAgentConfig(
    { locale: "th-TH", timezone: "Asia/Bangkok" },
    [
      "createScheduleItem", "getScheduleByRange", "updateScheduleStatus", "deleteOrCancelRoutine",
      "updateScheduleItem", "deleteScheduleItem",
      "createNote", "updateNote", "deleteNote", "searchNotes",
      "listMediaAssets", "updateMediaAssetLinks", "deleteMediaAsset",
      "searchVaultMetadata", "updateVaultMetadata", "deleteVaultSecret",
    ], async (name, rawInput) => {
      const input = rawInput as Input;
      switch (name) {
        case "createScheduleItem": {
          const type = text(input, "type") as "EVENT" | "TASK" | "ROUTINE";
          const recurrence = input.recurrenceRule;
          return createScheduleItem({
            title: text(input, "title") ?? "Untitled", description: text(input, "description") ?? null,
            type, startTime: text(input, "startTime") ? new Date(text(input, "startTime")!) : null,
            endTime: text(input, "endTime") ? new Date(text(input, "endTime")!) : null,
            isAllDay: input.isAllDay === true, status: (text(input, "status") as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED") ?? "PENDING",
            priority: (text(input, "priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM",
            recurrenceRule: recurrence ? JSON.stringify(recurrence) : null,
            routineEndDate: text(input, "routineEndDate") ? new Date(text(input, "routineEndDate")!) : null,
            parentRoutineId: null,
          });
        }
        case "getScheduleByRange":
          return getScheduleByRange(new Date(text(input, "rangeStart")!), new Date(text(input, "rangeEnd")!));
        case "updateScheduleStatus":
          return updateScheduleStatus(text(input, "id")!, text(input, "status") as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED");
        case "updateScheduleItem":
          return updateScheduleItem(text(input, "id")!, {
            title: text(input, "title"),
            description: nullableText(input, "description"),
            type: text(input, "type") as "EVENT" | "TASK" | "ROUTINE" | undefined,
            startTime: input.startTime === null ? null : text(input, "startTime") ? new Date(text(input, "startTime")!) : undefined,
            endTime: input.endTime === null ? null : text(input, "endTime") ? new Date(text(input, "endTime")!) : undefined,
            isAllDay: typeof input.isAllDay === "boolean" ? input.isAllDay : undefined,
            priority: text(input, "priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined,
            recurrenceRule: input.recurrenceRule === null ? null : input.recurrenceRule ? JSON.stringify(input.recurrenceRule) : undefined,
            routineEndDate: input.routineEndDate === null ? null : text(input, "routineEndDate") ? new Date(text(input, "routineEndDate")!) : undefined,
          });
        case "deleteScheduleItem":
          requireConfirmation(input);
          await deleteScheduleItem(text(input, "id")!);
          return { ok: true };
        case "deleteOrCancelRoutine":
          requireConfirmation(input);
          await deleteOrCancelRoutine(text(input, "routineId")!, text(input, "scope") as "ALL" | "INSTANCE", text(input, "instanceStartTime") ? new Date(text(input, "instanceStartTime")!) : undefined);
          return { ok: true };
        case "createNote":
          return createNote({
            title: text(input, "title")!, content: text(input, "content")!,
            tags: Array.isArray(input.tags) ? input.tags as string[] : undefined,
            folder: nullableText(input, "folder"), scheduleItemId: nullableText(input, "scheduleItemId"),
          });
        case "updateNote":
          return updateNote(text(input, "id")!, {
            title: text(input, "title"), content: text(input, "content"),
            tags: Array.isArray(input.tags) ? input.tags as string[] : undefined,
            folder: nullableText(input, "folder"), scheduleItemId: nullableText(input, "scheduleItemId"),
          });
        case "deleteNote":
          requireConfirmation(input);
          await deleteNote(text(input, "id")!);
          return { ok: true };
        case "searchNotes":
          return searchNotes(text(input, "query")!, typeof input.limit === "number" ? input.limit : 10);
        case "listMediaAssets":
          return listMediaAssets(typeof input.limit === "number" ? input.limit : 30);
        case "updateMediaAssetLinks":
          return updateMediaAssetLinks(text(input, "id")!, {
            noteId: nullableText(input, "noteId"), scheduleItemId: nullableText(input, "scheduleItemId"),
          });
        case "deleteMediaAsset":
          requireConfirmation(input);
          await deleteMediaAsset(text(input, "id")!);
          return { ok: true };
        case "searchVaultMetadata":
          return searchVaultMetadata(text(input, "query")!);
        case "updateVaultMetadata":
          return updateVaultMetadata(text(input, "id")!, {
            serviceName: text(input, "serviceName"), category: text(input, "category"),
            accountIdentifier: text(input, "accountIdentifier"), url: nullableText(input, "url"),
            notes: nullableText(input, "notes"),
          });
        case "deleteVaultSecret":
          requireConfirmation(input);
          await deleteVaultSecret(text(input, "id")!);
          return { ok: true };
      }
    },
  );

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    system: agent.system,
    messages: await convertToModelMessages(messages),
    tools: agent.tools,
    stopWhen: stepCountIs(5),
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "minimal" } } satisfies GoogleLanguageModelOptions,
    },
  });

  return result.toUIMessageStreamResponse({ onError: (error) => {
    const message = error instanceof Error ? error.message : "AI request failed";
    if (message.includes("no longer available")) return "โมเดล Gemini นี้ไม่พร้อมใช้งาน กรุณาตรวจ GEMINI_MODEL ใน environment";
    return process.env.NODE_ENV === "production" ? "Gemini ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่" : message;
  } });
}
