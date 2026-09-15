import { describe, expect, it } from "vitest";
import { isDiscordInteractionAllowed } from "./security";

describe("isDiscordInteractionAllowed", () => {
  it("allows user in user allowlist without channel restriction", () => {
    expect(isDiscordInteractionAllowed("123", "chan1", "123,456", "")).toBe(true);
  });

  it("rejects user not in allowlist", () => {
    expect(isDiscordInteractionAllowed("999", "chan1", "123,456", "")).toBe(false);
  });

  it("enforces channel restriction when specified", () => {
    expect(isDiscordInteractionAllowed("123", "chan1", "123", "chan1,chan2")).toBe(true);
    expect(isDiscordInteractionAllowed("123", "chan3", "123", "chan1,chan2")).toBe(false);
  });

  it("rejects when no allowed users are configured", () => {
    expect(isDiscordInteractionAllowed("123", "chan1", "", "")).toBe(false);
  });
});
