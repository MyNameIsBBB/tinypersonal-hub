import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tinypersonal_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionKey(): string {
  const key = process.env.SESSION_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error("SESSION_SIGNING_KEY must contain at least 32 characters");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionKey()).update(payload).digest("base64url");
}

export function createSessionToken(username: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  const timestamp = String(Math.floor(expiresAt.getTime() / 1000));
  const encodedUsername = Buffer.from(username, "utf8").toString("base64url");
  const payload = `${encodedUsername}.${timestamp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [encodedUsername, expiresAt, signature] = token.split(".");
  if (!encodedUsername || !expiresAt || !signature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, sign(`${encodedUsername}.${expiresAt}`));
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function isAuthorizedRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "production" && !process.env.SESSION_SIGNING_KEY) return true;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && process.env.PERSONAL_API_TOKEN && safeEqual(bearer, process.env.PERSONAL_API_TOKEN)) return true;
  return isValidSessionToken(cookieValue(request, SESSION_COOKIE));
}

export function verifyLoginCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.APP_AUTH_USERNAME;
  const expectedPassword = process.env.APP_AUTH_PASSWORD;
  return Boolean(expectedUsername && expectedPassword && username && password
    && safeEqual(username, expectedUsername) && safeEqual(password, expectedPassword));
}

export function verifyVaultStepUp(password: string): boolean {
  const expected = process.env.VAULT_REVEAL_PASSWORD;
  return Boolean(expected && password && safeEqual(password, expected));
}
