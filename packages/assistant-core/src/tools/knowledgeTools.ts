import { tool } from "ai";
import { z } from "zod";

export const searchNotesTool = tool({
  description: "Search the user's note knowledge base by words, tags, or folder. Returns note content only through the authorized worker.",
  inputSchema: z.object({
    query: z.string().trim().min(1).max(300),
    limit: z.number().int().min(1).max(20).default(10),
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "notes.search" as const, input }),
});

const noteFields = {
  title: z.string().trim().min(1).max(200),
  content: z.string().max(100_000),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  folder: z.string().trim().max(160).nullable().optional(),
  scheduleItemId: z.string().min(1).nullable().optional(),
};

export const createNoteTool = tool({
  description: "Create a Markdown note, optionally tagged, filed, and linked to a schedule item.",
  inputSchema: z.object(noteFields).strict(),
  execute: async (input) => ({ ok: true as const, command: "notes.create" as const, input }),
});

export const updateNoteTool = tool({
  description: "Update an existing note's title, Markdown content, tags, folder, or schedule link.",
  inputSchema: z.object({
    id: z.string().min(1),
    title: noteFields.title.optional(),
    content: noteFields.content.optional(),
    tags: noteFields.tags,
    folder: noteFields.folder,
    scheduleItemId: noteFields.scheduleItemId,
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "notes.update" as const, input }),
});

export const deleteNoteTool = tool({
  description: "Permanently delete a note. Ask the user for explicit confirmation first, then call with confirmed=true.",
  inputSchema: z.object({ id: z.string().min(1), confirmed: z.literal(true) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "notes.delete" as const, input }),
});

export const searchVaultMetadataTool = tool({
  description: "Search vault metadata such as service name, account identifier, category, and login URL. Never returns passwords, OTP seeds, ciphertext, IVs, or authentication tags.",
  inputSchema: z.object({ query: z.string().trim().min(1).max(200) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "vault.searchMetadata" as const, input }),
});

export const updateVaultMetadataTool = tool({
  description: "Update vault metadata only: service name, category, account identifier, URL, or notes. Never accepts or returns passwords, OTP seeds, or encryption fields.",
  inputSchema: z.object({
    id: z.string().min(1),
    serviceName: z.string().trim().min(1).max(160).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    accountIdentifier: z.string().trim().min(1).max(320).optional(),
    url: z.string().url().max(2_000).nullable().optional(),
    notes: z.string().max(5_000).nullable().optional(),
  }).strict(),
  execute: async (input) => ({ ok: true as const, command: "vault.updateMetadata" as const, input }),
});

export const deleteVaultSecretTool = tool({
  description: "Permanently delete a vault record without reading its secret. Ask the user for explicit confirmation first.",
  inputSchema: z.object({ id: z.string().min(1), confirmed: z.literal(true) }).strict(),
  execute: async (input) => ({ ok: true as const, command: "vault.delete" as const, input }),
});
