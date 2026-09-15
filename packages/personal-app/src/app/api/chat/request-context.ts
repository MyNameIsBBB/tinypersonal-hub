import { isCronAuthorizedRequest, isValidSessionToken, SESSION_COOKIE } from "../../../lib/serverAuth";

export type InternalChatWorker = {
  ownerKey: string;
  jobId: string;
  userMessageId: string;
};

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function resolveChatOwnerKey(request: Request): string | null {
  if (process.env.NODE_ENV !== "production" && !process.env.SESSION_SIGNING_KEY) {
    return "dev-shared";
  }

  const token = cookieValue(request, SESSION_COOKIE);
  try {
    if (!isValidSessionToken(token)) return null;
  } catch {
    return null;
  }

  const encodedUsername = token?.split(".")[0];
  if (!encodedUsername) return null;

  try {
    const username = Buffer.from(encodedUsername, "base64url").toString("utf8").trim().toLowerCase();
    return username ? `user:${username}` : null;
  } catch {
    return null;
  }
}

export function resolveInternalChatWorker(request: Request): InternalChatWorker | null {
  if (request.headers.get("x-chat-worker") !== "1") return null;
  const ownerKey = request.headers.get("x-chat-owner-key");
  const jobId = request.headers.get("x-chat-job-id");
  const userMessageId = request.headers.get("x-chat-user-message-id");
  if (!ownerKey || !jobId || !userMessageId || !isCronAuthorizedRequest(request)) return null;
  return { ownerKey, jobId, userMessageId };
}
