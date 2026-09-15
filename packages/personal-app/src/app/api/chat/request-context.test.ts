import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "../../../lib/serverAuth";
import { resolveChatOwnerKey, resolveInternalChatWorker } from "./request-context";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveChatOwnerKey", () => {
  it("uses the shared development owner when session auth is not configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SIGNING_KEY", "");

    expect(resolveChatOwnerKey(new Request("http://localhost/api/chat"))).toBe("dev-shared");
  });

  it("derives a normalized owner from a valid signed session", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SIGNING_KEY", "test-session-signing-key-at-least-32-characters");
    const { token } = createSessionToken("Person@Example.COM");
    const request = new Request("http://localhost/api/chat", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

    expect(resolveChatOwnerKey(request)).toBe("user:person@example.com");
  });

  it("rejects a missing production session", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SIGNING_KEY", "test-session-signing-key-at-least-32-characters");

    expect(resolveChatOwnerKey(new Request("http://localhost/api/chat"))).toBeNull();
  });
});

describe("resolveInternalChatWorker", () => {
  it("accepts a complete worker envelope with the cron bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const request = new Request("http://localhost/api/chat", {
      headers: {
        authorization: "Bearer test-cron-secret",
        "x-chat-worker": "1",
        "x-chat-owner-key": "user:person@example.com",
        "x-chat-job-id": "job-1",
        "x-chat-user-message-id": "message-1",
      },
    });

    expect(resolveInternalChatWorker(request)).toEqual({
      ownerKey: "user:person@example.com",
      jobId: "job-1",
      userMessageId: "message-1",
    });
  });

  it("rejects an incomplete or unauthorized worker envelope", () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    const request = new Request("http://localhost/api/chat", {
      headers: {
        "x-chat-worker": "1",
        "x-chat-owner-key": "user:person@example.com",
        "x-chat-job-id": "job-1",
        "x-chat-user-message-id": "message-1",
      },
    });

    expect(resolveInternalChatWorker(request)).toBeNull();
  });
});
