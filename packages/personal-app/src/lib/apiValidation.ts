import type { ZodType } from "zod";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<{ data: T } | { response: Response }> {
  try {
    const result = schema.safeParse(await request.json());
    if (result.success) return { data: result.data };
    return { response: Response.json({ error: "Invalid request", issues: result.error.issues.map(({ path, message }) => ({ path, message })) }, { status: 400 }) };
  } catch {
    return { response: Response.json({ error: "Request body must be valid JSON" }, { status: 400 }) };
  }
}
