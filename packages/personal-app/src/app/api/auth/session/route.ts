import { createSessionToken, SESSION_COOKIE, verifyLoginCredentials } from "@/lib/serverAuth";
import { loginSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export async function POST(request: Request) {
  const parsed = await parseJson(request, loginSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  if (!verifyLoginCredentials(body.username, body.password)) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const { token, expiresAt } = createSessionToken(body.username);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json({ ok: true }, {
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}; Expires=${expiresAt.toUTCString()}${secure}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE() {
  return Response.json({ ok: true }, {
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
}
