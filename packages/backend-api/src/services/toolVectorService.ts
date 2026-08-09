import { createHash } from "node:crypto";
import { prisma } from "../db/client";

const DIMENSIONS = 384;

export type ToolVectorDocument = { name: string; text: string };
export type ToolVectorHit = { name: string; score: number };

function hashFeature(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Local, deterministic feature-hashing embedding; works with Thai without an API/model download. */
export function embedToolText(value: string): number[] {
  const normalized = value.toLocaleLowerCase("th-TH").normalize("NFKC").replace(/\s+/g, " ").trim();
  const vector = Array<number>(DIMENSIONS).fill(0);
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const features = [...words.flatMap((word) => [`w:${word}`, `p:${word.slice(0, 4)}`])];
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      features.push(`c${size}:${normalized.slice(index, index + size)}`);
    }
  }
  for (const feature of features) {
    const hash = hashFeature(feature);
    const weight = feature.startsWith("w:") ? 2 : feature.startsWith("p:") ? 1.4 : 0.35;
    vector[hash % DIMENSIONS] += (hash & 0x80000000 ? -1 : 1) * weight;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => item / magnitude);
}

function cosine(left: number[], right: number[]): number {
  let score = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) score += left[index] * right[index];
  return score;
}

export async function searchToolVectors(query: string, documents: ToolVectorDocument[], limit: number): Promise<ToolVectorHit[]> {
  if (!query.trim() || documents.length === 0) return [];
  const existing = await prisma.toolVector.findMany({ where: { name: { in: documents.map((item) => item.name) } } });
  const byName = new Map(existing.map((item) => [item.name, item]));
  for (const document of documents) {
    const contentHash = createHash("sha256").update(document.text).digest("hex");
    if (byName.get(document.name)?.contentHash === contentHash) continue;
    await prisma.toolVector.upsert({
      where: { name: document.name },
      create: { name: document.name, content: document.text, contentHash, vectorJson: JSON.stringify(embedToolText(document.text)), dimensions: DIMENSIONS },
      update: { content: document.text, contentHash, vectorJson: JSON.stringify(embedToolText(document.text)), dimensions: DIMENSIONS },
    });
  }
  const records = await prisma.toolVector.findMany({ where: { name: { in: documents.map((item) => item.name) } } });
  const queryVector = embedToolText(query);
  return records.map((record) => ({ name: record.name, score: cosine(queryVector, JSON.parse(record.vectorJson) as number[]) }))
    .sort((left, right) => right.score - left.score).slice(0, Math.max(1, Math.min(limit, 5)));
}
