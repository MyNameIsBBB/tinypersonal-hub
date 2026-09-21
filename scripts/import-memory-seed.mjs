import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseLocalProfileSeed } from "../packages/assistant-core/src/memory/localSeed.mjs";

const seedPath = resolve("packages/backend-api/seed/best_ai_user_profile.enc.json");
const encodedKey = process.env.MEMORY_SEED_KEY;
if (!encodedKey) {
  console.log("Memory seed skipped: MEMORY_SEED_KEY is not configured");
  process.exit(0);
}
const ownerKey = process.env.MEMORY_SEED_OWNER_KEY?.trim()
  || (process.env.APP_AUTH_USERNAME?.trim().toLowerCase() ? `user:${process.env.APP_AUTH_USERNAME.trim().toLowerCase()}` : "");
if (!ownerKey) throw new Error("MEMORY_SEED_OWNER_KEY or APP_AUTH_USERNAME is required for memory seed import");
const key = Buffer.from(encodedKey, "base64");
if (key.length !== 32) throw new Error("MEMORY_SEED_KEY must be a base64-encoded 32-byte key");

const payload = JSON.parse(await readFile(seedPath, "utf8"));
if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm" || payload.aad !== "tinypersonal-memory-seed:v1") {
  throw new Error("Unsupported encrypted memory seed format");
}
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
decipher.setAAD(Buffer.from(payload.aad, "utf8"));
decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
const profileText = Buffer.concat([
  decipher.update(Buffer.from(payload.ciphertext, "base64")),
  decipher.final(),
]).toString("utf8");
const parsed = parseLocalProfileSeed(profileText);
const prisma = new PrismaClient();

try {
  const existing = await prisma.userModelSnapshot.findFirst({ where: { ownerKey } });
  if (existing) {
    console.log(`Memory seed skipped: User Model v${existing.version} already exists`);
    process.exit(0);
  }
  const observedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const model = { summary: parsed.summary, traits: [], motivations: [], frustrations: [], decisionStyle: [], communicationGuidance: [] };
    const memoryIds = [];
    for (const [bucket, items] of Object.entries(parsed.groups)) {
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
            evidenceJson: JSON.stringify([`best_ai_user_profile.txt:${item.line}`]),
            observedAt,
            lastConfirmedAt: observedAt,
            sensitivity: "PRIVATE",
            searchText: `Best ${bucket} ${item.claim}`.toLocaleLowerCase(),
          },
        });
        memoryIds.push(memory.id);
        model[bucket].push({ claim: item.claim, kind: item.kind, confidence: item.confidence, evidenceIds: [memory.id], counterEvidenceIds: [], firstObservedAt: observedAt.toISOString(), lastConfirmedAt: observedAt.toISOString(), status: "supported" });
      }
    }
    const snapshot = await tx.userModelSnapshot.create({ data: { ownerKey, version: 0, modelJson: JSON.stringify(model), basedOnMemoryIdsJson: JSON.stringify(memoryIds), source: "IMPORTED_PROFILE_LOCAL" } });
    return { version: snapshot.version, memories: memoryIds.length };
  });
  console.log(`Imported local User Model v${result.version} from encrypted seed (${result.memories} memories)`);
} finally {
  await prisma.$disconnect();
}
