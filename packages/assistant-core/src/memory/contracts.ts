import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "fact",
  "episode",
  "preference",
  "project",
  "relationship",
  "inferred_pattern",
]);

export const memorySensitivitySchema = z.enum(["normal", "private", "restricted"]);

export const extractedMemorySchema = z.object({
  type: memoryTypeSchema,
  subject: z.string().trim().min(1).max(160),
  predicate: z.string().trim().max(100).nullable(),
  claim: z.string().trim().min(1).max(1_000),
  source: z.enum(["user_explicit", "conversation_observation"]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(500)).max(8),
  validFrom: z.string().datetime({ offset: true }).nullable(),
  validUntil: z.string().datetime({ offset: true }).nullable(),
  sensitivity: memorySensitivitySchema,
}).strict();

export const memoryExtractionSchema = z.object({
  memories: z.array(extractedMemorySchema).max(8),
  timelineEvents: z.array(z.object({
    occurredAt: z.string().datetime({ offset: true }),
    category: z.enum(["project", "interest", "relationship", "goal", "turning_point"]),
    description: z.string().trim().min(1).max(500),
    confidence: z.number().min(0).max(1),
    evidence: z.array(z.string().trim().min(1).max(500)).max(8),
  }).strict()).max(4),
}).strict();

export const userModelClaimSchema = z.object({
  claim: z.string().trim().min(1).max(1_000),
  kind: z.enum(["fact", "preference", "inferred_pattern"]),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()).max(30),
  counterEvidenceIds: z.array(z.string()).max(30),
  firstObservedAt: z.string().datetime({ offset: true }).nullable(),
  lastConfirmedAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["supported", "uncertain", "changed"]),
}).strict();

export const userModelSchema = z.object({
  summary: z.string().trim().max(2_000),
  traits: z.array(userModelClaimSchema).max(12),
  motivations: z.array(userModelClaimSchema).max(12),
  frustrations: z.array(userModelClaimSchema).max(12),
  decisionStyle: z.array(userModelClaimSchema).max(12),
  communicationGuidance: z.array(userModelClaimSchema).max(12),
}).strict();

export const reflectionOutputSchema = z.object({
  proposedModel: userModelSchema,
  changes: z.array(z.object({
    action: z.enum(["add", "revise", "remove", "retain"]),
    previousClaim: z.string().max(1_000).nullable(),
    proposedClaim: z.string().max(1_000).nullable(),
    reason: z.string().max(1_000),
    confidence: z.number().min(0).max(1),
    evidenceIds: z.array(z.string()).max(30),
  }).strict()).max(30),
}).strict();

export const memoryReviewSchema = z.object({
  action: z.enum(["confirm", "dispute", "retract"]),
}).strict();

export const proposalReviewSchema = z.object({
  action: z.enum(["approve", "reject"]),
}).strict();

export const memorySeedSchema = z.object({
  profileText: z.string().trim().min(1).max(100_000),
}).strict();

export type ExtractedMemory = z.infer<typeof extractedMemorySchema>;
export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;
export type UserModel = z.infer<typeof userModelSchema>;
export type ReflectionOutput = z.infer<typeof reflectionOutputSchema>;
