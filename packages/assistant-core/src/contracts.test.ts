import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "./contracts";

describe("chat request contract", () => {
  it("accepts the AI SDK envelope used by a new Jarvis session", () => {
    expect(chatRequestSchema.safeParse({
      id: "tinypersonal-jarvis",
      trigger: "submit-message",
      sessionId: null,
      messages: [],
      voiceMode: true,
      jarvisMode: true,
    }).success).toBe(true);
  });

  it("remains strict for unknown fields", () => {
    expect(chatRequestSchema.safeParse({ messages: [], unexpected: true }).success).toBe(false);
  });
});
