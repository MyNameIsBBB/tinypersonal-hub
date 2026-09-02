import { getOrCreateChatSession, saveUserMessageAndEnqueueChatGeneration } from "@tinypersonal/backend-api";
import { z } from "zod";
import { parseJson } from "@/lib/apiValidation";
import { authorizedOwnerKey } from "@/lib/serverAuth";

const saveMessageSchema = z.object({
  sessionId: z.string().trim().min(1).max(191),
  message: z.object({
    id: z.string().trim().min(1).max(191),
    role: z.literal("user"),
    parts: z.array(z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(100_000) }).strict(),
      z.object({
        type: z.literal("file"),
        mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        filename: z.string().trim().min(1).max(255).optional(),
        url: z.string().startsWith("data:image/").max(7_500_000),
      }).strict(),
    ])).min(1).max(4),
  }).strict(),
  voiceMode: z.boolean().optional(),
}).strict().superRefine(({ message }, context) => {
  const fileCount = message.parts.filter(({ type }) => type === "file").length;
  if (fileCount > 3) context.addIssue({ code: "custom", path: ["message", "parts"], message: "Up to 3 images are allowed" });
});

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(request, saveMessageSchema);
  if ("response" in parsed) return parsed.response;

  const session = await getOrCreateChatSession(ownerKey, parsed.data.sessionId);
  if (session.id !== parsed.data.sessionId) {
    return Response.json({ error: "Chat session not found" }, { status: 404 });
  }
  const job = await saveUserMessageAndEnqueueChatGeneration({
    ownerKey,
    sessionId: session.id,
    message: parsed.data.message,
    request: { voiceMode: parsed.data.voiceMode ?? false },
  });
  return Response.json({ ok: true, jobId: job.id }, { headers: { "Cache-Control": "no-store" } });
}
