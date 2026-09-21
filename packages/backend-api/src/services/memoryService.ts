import { google } from "@ai-sdk/google";
import {
  memoryExtractionSchema,
  parseLocalProfileSeed,
  reflectionOutputSchema,
  userModelSchema,
  type LocalSeedBucket,
  type MemoryExtraction,
  type UserModel,
} from "@tinypersonal/assistant-core";
import { generateObject } from "ai";
import { prisma } from "../db/client";

const TYPE_TO_DB = {
  fact: "FACT",
  episode: "EPISODE",
  preference: "PREFERENCE",
  project: "PROJECT",
  relationship: "RELATIONSHIP",
  inferred_pattern: "INFERRED_PATTERN",
} as const;

const SENSITIVITY_TO_DB = {
  normal: "NORMAL",
  private: "PRIVATE",
  restricted: "RESTRICTED",
} as const;

const TYPE_QUOTA = {
  FACT: 5,
  EPISODE: 3,
  PREFERENCE: 3,
  PROJECT: 3,
  RELATIONSHIP: 3,
  INFERRED_PATTERN: 2,
} as const;

type RankedMemory = {
  id: string;
  type: string;
  subject: string;
  claim: string;
  confidence: number;
  source: string;
  evidenceJson: string;
  observedAt: Date;
  lastConfirmedAt: Date | null;
  updatedAt: Date;
  sensitivity: string;
  searchText: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function queryTerms(query: string) {
  return [...new Set(query.toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2))].slice(0, 30);
}

export function scoreMemoryForContext(memory: RankedMemory, query: string, now = new Date()) {
  const haystack = `${memory.subject} ${memory.claim} ${memory.searchText}`.toLocaleLowerCase();
  const terms = queryTerms(query);
  const matched = terms.filter((term) => haystack.includes(term)).length;
  const semanticProxy = terms.length ? matched / terms.length : 0;
  const directPhrase = query.trim().length >= 3 && haystack.includes(query.trim().toLocaleLowerCase()) ? 0.25 : 0;
  const ageDays = Math.max(0, (now.getTime() - memory.updatedAt.getTime()) / 86_400_000);
  const recency = Math.max(0.35, Math.exp(-ageDays / 365));
  const sourceReliability = memory.source === "USER_EXPLICIT" || memory.lastConfirmedAt ? 1 : memory.type === "INFERRED_PATTERN" ? 0.8 : 0.9;
  const typeImportance = memory.type === "PROJECT" || memory.type === "PREFERENCE" ? 1 : 0.9;
  return clamp((0.2 + semanticProxy * 0.55 + directPhrase) * memory.confidence * recency * sourceReliability * typeImportance);
}

function safelyParseArray(value: string): unknown[] {
  const parsed = safelyParseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safelyParseJson<T>(value: string, fallback: T): unknown | T {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function serializeMemory(memory: RankedMemory, relevance?: number) {
  return {
    id: memory.id,
    type: memory.type.toLocaleLowerCase(),
    subject: memory.subject,
    claim: memory.claim,
    confidence: memory.confidence,
    source: memory.source.toLocaleLowerCase(),
    evidence: safelyParseArray(memory.evidenceJson),
    observedAt: memory.observedAt.toISOString(),
    lastConfirmedAt: memory.lastConfirmedAt?.toISOString() ?? null,
    relevance,
  };
}

export async function retrievePersonalContext(ownerKey: string, query: string, now = new Date()) {
  const [snapshot, memories, timeline] = await Promise.all([
    prisma.userModelSnapshot.findFirst({ where: { ownerKey }, orderBy: { version: "desc" } }),
    prisma.personalMemory.findMany({
      where: {
        ownerKey,
        status: "ACTIVE",
        sensitivity: { not: "RESTRICTED" },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
    prisma.relationshipTimelineEvent.findMany({
      where: { ownerKey },
      orderBy: { occurredAt: "desc" },
      take: 5,
    }),
  ]);

  const ranked = memories
    .map((memory) => ({ memory, score: scoreMemoryForContext(memory, query, now) }))
    .sort((left, right) => right.score - left.score);
  const counts = new Map<string, number>();
  const selected = ranked.filter(({ memory, score }) => {
    if (score < 0.12) return false;
    const quota = TYPE_QUOTA[memory.type as keyof typeof TYPE_QUOTA] ?? 2;
    const count = counts.get(memory.type) ?? 0;
    if (count >= quota) return false;
    counts.set(memory.type, count + 1);
    return true;
  }).slice(0, 14);

  const parsedModel = snapshot ? userModelSchema.safeParse(safelyParseJson(snapshot.modelJson, null)) : null;
  return {
    userModel: parsedModel?.success ? parsedModel.data : null,
    userModelVersion: snapshot?.version ?? null,
    memories: selected.map(({ memory, score }) => serializeMemory(memory, score)),
    timeline: timeline.reverse().map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt.toISOString(),
      category: event.category,
      description: event.description,
      confidence: event.confidence,
      evidence: safelyParseArray(event.evidenceJson),
    })),
  };
}

export async function listMemoryWorkspace(ownerKey: string, limit = 100) {
  const [memories, snapshots, proposals, timeline, runs] = await Promise.all([
    prisma.personalMemory.findMany({ where: { ownerKey }, orderBy: { updatedAt: "desc" }, take: Math.min(Math.max(limit, 1), 300) }),
    prisma.userModelSnapshot.findMany({ where: { ownerKey }, orderBy: { version: "desc" }, take: 20 }),
    prisma.userModelProposal.findMany({ where: { ownerKey }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.relationshipTimelineEvent.findMany({ where: { ownerKey }, orderBy: { occurredAt: "desc" }, take: 100 }),
    prisma.memoryProcessingRun.findMany({ where: { ownerKey }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return {
    memories: memories.map((memory) => ({ ...serializeMemory(memory), status: memory.status.toLocaleLowerCase(), sensitivity: memory.sensitivity.toLocaleLowerCase(), validFrom: memory.validFrom?.toISOString() ?? null, validUntil: memory.validUntil?.toISOString() ?? null, updatedAt: memory.updatedAt.toISOString() })),
    snapshots: snapshots.map((snapshot) => ({ ...snapshot, model: safelyParseJson(snapshot.modelJson, null), basedOnMemoryIds: safelyParseArray(snapshot.basedOnMemoryIdsJson), modelJson: undefined, basedOnMemoryIdsJson: undefined })),
    proposals: proposals.map((proposal) => ({ ...proposal, proposedModel: safelyParseJson(proposal.proposedModelJson, null), changes: safelyParseArray(proposal.changesJson), basedOnMemoryIds: safelyParseArray(proposal.basedOnMemoryIdsJson), proposedModelJson: undefined, changesJson: undefined, basedOnMemoryIdsJson: undefined })),
    timeline: timeline.map((event) => ({ ...event, evidence: safelyParseArray(event.evidenceJson), evidenceJson: undefined })),
    runs,
  };
}

export async function reviewMemory(ownerKey: string, id: string, action: "confirm" | "dispute" | "retract") {
  const existing = await prisma.personalMemory.findFirst({ where: { id, ownerKey } });
  if (!existing) return null;
  return prisma.personalMemory.update({
    where: { id },
    data: action === "confirm"
      ? { status: "ACTIVE", confidence: Math.max(existing.confidence, 0.98), lastConfirmedAt: new Date(), source: "USER_EXPLICIT" }
      : { status: action === "dispute" ? "DISPUTED" : "RETRACTED" },
  });
}

function extractionPrompt(now: Date) {
  return `Extract only durable, personally useful memories from this conversation.
Distinguish explicit facts from inferred patterns. Never turn an inference into a fact.
Set source=user_explicit only when the user directly states the claim; otherwise use conversation_observation.
Use inferred_pattern only when the conversation itself contains meaningful behavioural evidence; cap its confidence at 0.85.
Ignore greetings, transient requests, assistant claims, passwords, tokens, authentication data, financial account data, health identifiers, and anything the user asks not to remember.
Prefer zero memories over low-value memories. Evidence must be short excerpts or paraphrases grounded in the supplied conversation.
Create timeline events only for meaningful changes, beginnings, endings, goals, relationships, or turning points.
Current timestamp: ${now.toISOString()}. Return ISO timestamps with offsets.`;
}

export async function processConversationMemory(input: {
  ownerKey: string;
  sessionId: string;
  sourceMessageId: string;
  userText: string;
  assistantText: string;
  now?: Date;
}) {
  if (process.env.MEMORY_LEARNING_ENABLED === "false") return { skipped: true as const, reason: "disabled" };
  const now = input.now ?? new Date();
  const existing = await prisma.memoryProcessingRun.findUnique({
    where: { ownerKey_sourceMessageId: { ownerKey: input.ownerKey, sourceMessageId: input.sourceMessageId } },
  });
  if (existing) return { skipped: true as const, reason: "already_processed" };
  const run = await prisma.memoryProcessingRun.create({
    data: { ownerKey: input.ownerKey, sessionId: input.sessionId, sourceMessageId: input.sourceMessageId, status: "RUNNING" },
  });

  try {
    const { object } = await generateObject({
      model: google(process.env.GEMINI_MEMORY_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
      schema: memoryExtractionSchema,
      system: extractionPrompt(now),
      prompt: `USER MESSAGE:\n${input.userText.slice(0, 12_000)}\n\nASSISTANT RESPONSE (context only; do not treat as user truth):\n${input.assistantText.slice(0, 12_000)}`,
    });
    const extracted = object as MemoryExtraction;
    await prisma.$transaction(async (tx) => {
      for (const memory of extracted.memories) {
        const confidence = memory.type === "inferred_pattern" ? Math.min(memory.confidence, 0.85) : memory.confidence;
        const source = memory.type === "inferred_pattern" ? "MODEL_INFERENCE" : memory.source === "user_explicit" ? "USER_EXPLICIT" : "CONVERSATION_OBSERVATION";
        await tx.personalMemory.upsert({
          where: { ownerKey_sourceMessageId_claim: { ownerKey: input.ownerKey, sourceMessageId: input.sourceMessageId, claim: memory.claim } },
          create: {
            ownerKey: input.ownerKey,
            type: TYPE_TO_DB[memory.type],
            subject: memory.subject,
            predicate: memory.predicate,
            claim: memory.claim,
            confidence,
            source,
            sourceSessionId: input.sessionId,
            sourceMessageId: input.sourceMessageId,
            evidenceJson: JSON.stringify(memory.evidence),
            validFrom: memory.validFrom ? new Date(memory.validFrom) : null,
            validUntil: memory.validUntil ? new Date(memory.validUntil) : null,
            observedAt: now,
            sensitivity: SENSITIVITY_TO_DB[memory.sensitivity],
            searchText: `${memory.subject} ${memory.predicate ?? ""} ${memory.claim} ${memory.evidence.join(" ")}`.toLocaleLowerCase(),
          },
          update: { confidence, evidenceJson: JSON.stringify(memory.evidence), validUntil: memory.validUntil ? new Date(memory.validUntil) : null },
        });
      }
      for (const event of extracted.timelineEvents) {
        await tx.relationshipTimelineEvent.create({
          data: { ownerKey: input.ownerKey, occurredAt: new Date(event.occurredAt), category: event.category, description: event.description, confidence: event.confidence, evidenceJson: JSON.stringify(event.evidence) },
        });
      }
      await tx.memoryProcessingRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", extractedCount: extracted.memories.length, completedAt: new Date() } });
    });
    await maybeCreateReflectionProposal(input.ownerKey);
    return { skipped: false as const, extractedCount: extracted.memories.length };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown memory extraction error";
    await prisma.memoryProcessingRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, completedAt: new Date() } });
    throw error;
  }
}

function reflectionPrompt(previous: UserModel | null) {
  return `Build a proposed evidence-backed user model from the supplied structured memories.
Identify repeatedly supported patterns, wrong prior assumptions, changed preferences, motivations, frustrations, decision style, and helpful communication adaptations.
Every claim must cite supplied memory IDs. Facts and preferences may be explicit; behavioural conclusions must be inferred_pattern.
Keep uncertainty visible. Counter-evidence must lower confidence. Do not diagnose, stereotype, or infer sensitive attributes.
This is a proposal for user review, not unquestionable truth.
Previous approved model:\n${previous ? JSON.stringify(previous) : "none"}`;
}

export async function maybeCreateReflectionProposal(ownerKey: string, force = false) {
  const pending = await prisma.userModelProposal.findFirst({ where: { ownerKey, status: "PENDING" } });
  if (pending) return pending;
  const latest = await prisma.userModelSnapshot.findFirst({ where: { ownerKey }, orderBy: { version: "desc" } });
  const threshold = Math.min(50, Math.max(20, Number(process.env.MEMORY_REFLECTION_INTERVAL ?? 25) || 25));
  const runsSince = await prisma.memoryProcessingRun.count({
    where: { ownerKey, status: "SUCCEEDED", ...(latest?.throughRunAt ? { completedAt: { gt: latest.throughRunAt } } : {}) },
  });
  if (!force && runsSince < threshold) return null;
  const memories = await prisma.personalMemory.findMany({ where: { ownerKey, status: { in: ["ACTIVE", "DISPUTED"] } }, orderBy: { updatedAt: "desc" }, take: 200 });
  if (!memories.length) return null;
  const previousParsed = latest ? userModelSchema.safeParse(safelyParseJson(latest.modelJson, null)) : null;
  const previous = previousParsed?.success ? previousParsed.data : null;
  const { object } = await generateObject({
    model: google(process.env.GEMINI_MEMORY_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"),
    schema: reflectionOutputSchema,
    system: reflectionPrompt(previous),
    prompt: JSON.stringify(memories.map((memory) => ({ id: memory.id, type: memory.type.toLocaleLowerCase(), claim: memory.claim, confidence: memory.confidence, status: memory.status.toLocaleLowerCase(), evidence: safelyParseArray(memory.evidenceJson), observedAt: memory.observedAt.toISOString(), lastConfirmedAt: memory.lastConfirmedAt?.toISOString() ?? null }))),
  });
  const output = reflectionOutputSchema.parse(object);
  const allowedIds = new Set(memories.map((memory) => memory.id));
  const cleanClaims = (claims: UserModel["traits"]) => claims
    .map((claim) => ({
      ...claim,
      evidenceIds: claim.evidenceIds.filter((id) => allowedIds.has(id)),
      counterEvidenceIds: claim.counterEvidenceIds.filter((id) => allowedIds.has(id)),
    }))
    .filter((claim) => claim.evidenceIds.length > 0);
  const proposedModel: UserModel = {
    ...output.proposedModel,
    traits: cleanClaims(output.proposedModel.traits),
    motivations: cleanClaims(output.proposedModel.motivations),
    frustrations: cleanClaims(output.proposedModel.frustrations),
    decisionStyle: cleanClaims(output.proposedModel.decisionStyle),
    communicationGuidance: cleanClaims(output.proposedModel.communicationGuidance),
  };
  const changes = output.changes.map((change) => ({
    ...change,
    evidenceIds: change.evidenceIds.filter((id) => allowedIds.has(id)),
  }));
  const modelEvidenceIds = [
    ...proposedModel.traits,
    ...proposedModel.motivations,
    ...proposedModel.frustrations,
    ...proposedModel.decisionStyle,
    ...proposedModel.communicationGuidance,
  ].flatMap((claim) => [...claim.evidenceIds, ...claim.counterEvidenceIds]);
  const evidenceIds = [...new Set([...changes.flatMap((change) => change.evidenceIds), ...modelEvidenceIds])];
  const proposal = await prisma.userModelProposal.create({ data: { ownerKey, baseSnapshotId: latest?.id, proposedModelJson: JSON.stringify(proposedModel), changesJson: JSON.stringify(changes), basedOnMemoryIdsJson: JSON.stringify(evidenceIds) } });
  if (process.env.MEMORY_AUTO_APPROVE_REFLECTIONS === "true") await reviewUserModelProposal(ownerKey, proposal.id, "approve");
  return proposal;
}

export async function reviewUserModelProposal(ownerKey: string, id: string, action: "approve" | "reject") {
  const proposal = await prisma.userModelProposal.findFirst({ where: { id, ownerKey, status: "PENDING" } });
  if (!proposal) return null;
  if (action === "reject") return prisma.userModelProposal.update({ where: { id }, data: { status: "REJECTED", resolvedAt: new Date() } });
  return prisma.$transaction(async (tx) => {
    const latest = await tx.userModelSnapshot.findFirst({ where: { ownerKey }, orderBy: { version: "desc" } });
    const throughRun = await tx.memoryProcessingRun.findFirst({ where: { ownerKey, status: "SUCCEEDED" }, orderBy: { completedAt: "desc" } });
    const snapshot = await tx.userModelSnapshot.create({ data: { ownerKey, version: (latest?.version ?? -1) + 1, modelJson: proposal.proposedModelJson, basedOnMemoryIdsJson: proposal.basedOnMemoryIdsJson, supersedesId: latest?.id, throughRunAt: throughRun?.completedAt } });
    await tx.userModelProposal.update({ where: { id }, data: { status: "APPROVED", resolvedAt: new Date() } });
    return snapshot;
  });
}

export async function importUserModelSeed(ownerKey: string, profileText: string) {
  const existing = await prisma.userModelSnapshot.findFirst({ where: { ownerKey } });
  if (existing) throw new Error("A user model already exists for this owner");
  const text = profileText.trim();
  if (!text) throw new Error("Seed profile is empty");
  const parsed = parseLocalProfileSeed(text);
  const observedAt = new Date();
  return prisma.$transaction(async (tx) => {
    const model: UserModel = { summary: parsed.summary, traits: [], motivations: [], frustrations: [], decisionStyle: [], communicationGuidance: [] };
    const memoryIds: string[] = [];
    for (const [bucket, items] of Object.entries(parsed.groups) as Array<[LocalSeedBucket, typeof parsed.groups[LocalSeedBucket]]>) {
      for (const item of items) {
        const memory = await tx.personalMemory.create({
          data: {
            ownerKey,
            type: item.memoryType,
            subject: "Best",
            predicate: bucket,
            claim: item.claim,
            confidence: item.confidence,
            source: "IMPORTED_PROFILE_LOCAL",
            evidenceJson: JSON.stringify([`imported-profile:${item.line}`]),
            observedAt,
            lastConfirmedAt: observedAt,
            sensitivity: "PRIVATE",
            searchText: `Best ${bucket} ${item.claim}`.toLocaleLowerCase(),
          },
        });
        memoryIds.push(memory.id);
        model[bucket].push({
          claim: item.claim,
          kind: item.kind,
          confidence: item.confidence,
          evidenceIds: [memory.id],
          counterEvidenceIds: [],
          firstObservedAt: observedAt.toISOString(),
          lastConfirmedAt: observedAt.toISOString(),
          status: "supported",
        });
      }
    }
    return tx.userModelSnapshot.create({
      data: {
        ownerKey,
        version: 0,
        modelJson: JSON.stringify(model),
        basedOnMemoryIdsJson: JSON.stringify(memoryIds),
        source: "IMPORTED_PROFILE_LOCAL",
      },
    });
  });
}
