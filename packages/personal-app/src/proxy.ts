import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "tinypersonal_session";

async function validSession(token: string | undefined): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && !process.env.SESSION_SIGNING_KEY) return true;
  if (!token || !process.env.SESSION_SIGNING_KEY) return false;
  const [encodedUsername, expiresAt, signature] = token.split(".");
  if (!encodedUsername || !expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.SESSION_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${encodedUsername}.${expiresAt}`)));
  const normalized = signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "=");
  const supplied = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return supplied.length === expected.length && supplied.every((byte, index) => byte === expected[index]);
}

export async function proxy(request: NextRequest) {
  if (await validSession(request.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/", "/ai/:path*", "/notes/:path*", "/media/:path*", "/vault/:path*"] };
