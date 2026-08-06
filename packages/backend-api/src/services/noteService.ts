import { prisma } from "../db/client";

export type NoteInput = {
  title: string;
  content: string;
  tags?: string[];
  folder?: string | null;
  scheduleItemId?: string | null;
};

export type Note = NoteInput & {
  id: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type EmbeddingProvider = {
  embed(text: string): Promise<number[]>;
};

function normalizeTags(tags: string[] = []): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

function toDomain(note: {
  id: string; title: string; content: string; tagsJson: string; folder: string | null;
  scheduleItemId: string | null; createdAt: Date; updatedAt: Date;
}): Note {
  return { ...note, tags: JSON.parse(note.tagsJson) as string[] };
}

export async function createNote(input: NoteInput, embeddings?: EmbeddingProvider): Promise<Note> {
  const tags = normalizeTags(input.tags);
  const searchText = [input.title, input.content, tags.join(" "), input.folder].filter(Boolean).join(" ").toLowerCase();
  const embedding = embeddings ? await embeddings.embed(searchText) : null;
  return toDomain(await prisma.note.create({ data: {
    title: input.title.trim(),
    content: input.content,
    tagsJson: JSON.stringify(tags),
    folder: input.folder,
    scheduleItemId: input.scheduleItemId,
    searchText,
    embeddingJson: embedding ? JSON.stringify(embedding) : null,
  } }));
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || !left.length) return -1;
  let dot = 0; let leftMagnitude = 0; let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1);
}

export async function searchNotes(query: string, limit = 20, embeddings?: EmbeddingProvider): Promise<Note[]> {
  const normalized = query.trim().toLowerCase();
  if (embeddings && normalized) {
    const queryEmbedding = await embeddings.embed(normalized);
    const candidates = await prisma.note.findMany({ where: { embeddingJson: { not: null } }, take: 500 });
    return candidates
      .map((note) => ({ note, score: cosineSimilarity(queryEmbedding, JSON.parse(note.embeddingJson!) as number[]) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.min(Math.max(limit, 1), 100))
      .map(({ note }) => toDomain(note));
  }
  const notes = await prisma.note.findMany({
    where: normalized ? { searchText: { contains: normalized } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return notes.map(toDomain);
}

export async function updateNote(id: string, input: Partial<NoteInput>): Promise<Note> {
  const current = await prisma.note.findUniqueOrThrow({ where: { id } });
  const title = input.title?.trim() ?? current.title;
  const content = input.content ?? current.content;
  const tags = input.tags ? normalizeTags(input.tags) : JSON.parse(current.tagsJson) as string[];
  const folder = input.folder === undefined ? current.folder : input.folder;
  return toDomain(await prisma.note.update({ where: { id }, data: {
    title, content, tagsJson: JSON.stringify(tags), folder,
    scheduleItemId: input.scheduleItemId,
    searchText: [title, content, tags.join(" "), folder].filter(Boolean).join(" ").toLowerCase(),
    embeddingJson: null,
  } }));
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.note.delete({ where: { id } });
}
