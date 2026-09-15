import { prisma } from "../db/client";
import { z } from "zod";
import { defineJsonCodec } from "../serialization/jsonCodec";

const MAX_TEXT_LENGTH = 4_000;
const MAX_TOOL_EVENTS = 50;

function sanitizeErrorMessage(message: string) {
  return message
    .replace(/Bearer\s+[^\s"']+/giu, "Bearer [redacted]")
    .replace(/([?&](?:key|api[_-]?key|token)=)[^&\s]+/giu, "$1[redacted]")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

export function describeAgentError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return sanitizeErrorMessage(error.message);
  if (typeof error === "string" && error.trim()) return sanitizeErrorMessage(error);
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return sanitizeErrorMessage(record.message);
    if (record.error !== undefined && record.error !== error) return describeAgentError(record.error);
    if (record.cause !== undefined && record.cause !== error) return describeAgentError(record.cause);
    if (typeof record.code === "string" && record.code.trim()) return `AI provider error (${sanitizeErrorMessage(record.code)})`;
  }
  return "AI provider returned an unrecognized error";
}

export type AgentToolTrace = {
  toolName: string;
  durationMs: number;
  result: "success" | "error";
  summary?: string;
  at: string;
};

const toolTraceCodec = defineJsonCodec(z.array(z.object({
  toolName: z.string(),
  durationMs: z.number().nonnegative(),
  result: z.enum(["success", "error"]),
  summary: z.string().optional(),
  at: z.string().datetime(),
}).strict()));
const stringListCodec = defineJsonCodec(z.array(z.string()));
const traceContextSchema = z.array(z.object({
  source: z.string(),
  entity: z.string(),
  value: z.string().max(4_000),
  relevance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  updatedAt: z.string().datetime(),
  sensitivity: z.enum(["normal", "private", "secret"]),
}).strict()).max(50);
const traceContextCodec = defineJsonCodec(traceContextSchema);
export type AgentTraceContextItem = z.input<typeof traceContextSchema>[number];

export async function createAgentRunTrace(input: {
  ownerKey: string;
  sessionId: string;
  userMessageId: string;
  intent: string;
  context: AgentTraceContextItem[];
  allowedTools: string[];
  model: string;
}) {
  return prisma.agentRunTrace.create({
    data: {
      ownerKey: input.ownerKey,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      intent: input.intent,
      contextJson: traceContextCodec.serialize(input.context),
      allowedToolsJson: stringListCodec.serialize(input.allowedTools),
      model: input.model,
    },
  });
}

export async function appendAgentToolTraces(id: string, events: AgentToolTrace[]) {
  if (events.length === 0) return;
  await prisma.$transaction(async (tx) => {
    const trace = await tx.agentRunTrace.findUniqueOrThrow({
      where: { id },
      select: { toolCallsJson: true },
    });
    let existing: AgentToolTrace[] = [];
    try {
      existing = toolTraceCodec.parse(trace.toolCallsJson);
    } catch {}
    await tx.agentRunTrace.update({
      where: { id },
      data: { toolCallsJson: toolTraceCodec.serialize([...existing, ...events].slice(-MAX_TOOL_EVENTS)) },
    });
  });
}

export async function completeAgentRunTrace(
  id: string,
  input: { finalResponse: string; durationMs: number },
) {
  return prisma.agentRunTrace.update({
    where: { id },
    data: {
      status: "SUCCEEDED",
      finalResponse: input.finalResponse.slice(0, MAX_TEXT_LENGTH),
      durationMs: Math.max(0, Math.round(input.durationMs)),
      completedAt: new Date(),
    },
  });
}

export async function failAgentRunTrace(id: string, error: unknown, durationMs: number) {
  const message = describeAgentError(error);
  return prisma.agentRunTrace.update({
    where: { id },
    data: {
      status: "FAILED",
      error: message.slice(0, MAX_TEXT_LENGTH),
      durationMs: Math.max(0, Math.round(durationMs)),
      completedAt: new Date(),
    },
  });
}

export async function getAgentRunTrace(ownerKey: string, id: string) {
  return prisma.agentRunTrace.findFirst({ where: { id, ownerKey } });
}

export async function listAgentRunTraces(ownerKey: string, limit = 30) {
  const rows = await prisma.agentRunTrace.findMany({
    where: { ownerKey },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return rows.map((row) => ({
    ...row,
    context: traceContextCodec.parse(row.contextJson),
    allowedTools: stringListCodec.parse(row.allowedToolsJson),
    toolCalls: toolTraceCodec.parse(row.toolCallsJson),
    contextJson: undefined,
    allowedToolsJson: undefined,
    toolCallsJson: undefined,
  }));
}
