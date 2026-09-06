import { resolveChatOwnerKey } from "../chat/request-context";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export async function taskRequest(request: Request, run: (owner: string) => Promise<unknown>, status = 200) {
  const owner = resolveChatOwnerKey(request);
  if (!owner) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, data: await run(owner) }, { status });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid task input" }, { status: 400 });
    if ((error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      || (error instanceof Error && /not found/i.test(error.message))) {
      return Response.json({ error: "Task or checklist item not found" }, { status: 404 });
    }
    return Response.json({ error: "Task operation failed" }, { status: 500 });
  }
}
