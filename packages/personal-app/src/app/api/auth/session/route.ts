import { createSessionToken, SESSION_COOKIE, verifyLoginCredentials } from "@/lib/serverAuth";

export async function POST(request: Request) {
  const body = await request.json() as { username?: string; password?: string };
  if (!verifyLoginCredentials(body.username ?? "", body.password ?? "")) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const { token, expiresAt } = createSessionToken(body.username!);
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
