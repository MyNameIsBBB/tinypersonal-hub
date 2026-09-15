import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isDiscordInteractionAllowed, verifyDiscordRequest } from "./discordSecurity";

describe("Discord interaction verification", () => {
  it("accepts an authentic Ed25519 signature and rejects modified content", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const publicDer = publicKey.export({ format: "der", type: "spki" });
    const publicKeyHex = publicDer.subarray(-32).toString("hex");
    const timestamp = "1789000000";
    const body = JSON.stringify({ type: 1 });
    const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");

    expect(verifyDiscordRequest(body, timestamp, signature, publicKeyHex)).toBe(true);
    expect(verifyDiscordRequest(`${body} `, timestamp, signature, publicKeyHex)).toBe(false);
  });
});

describe("Discord interaction access", () => {
  it("requires an allowed user and, when configured, an allowed channel", () => {
    expect(isDiscordInteractionAllowed("user-1", "channel-1", "user-1", "channel-1")).toBe(true);
    expect(isDiscordInteractionAllowed("user-2", "channel-1", "user-1", "channel-1")).toBe(false);
    expect(isDiscordInteractionAllowed("user-1", "channel-2", "user-1", "channel-1")).toBe(false);
    expect(isDiscordInteractionAllowed("user-1", "any-channel", "user-1", "")).toBe(true);
  });
});
