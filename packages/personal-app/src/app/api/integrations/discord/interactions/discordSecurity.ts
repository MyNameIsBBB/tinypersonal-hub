import { createPublicKey, verify } from "node:crypto";

export function verifyDiscordRequest(body: string, timestamp: string | null, signature: string | null, publicKeyHex = process.env.DISCORD_PUBLIC_KEY): boolean {
  if (!timestamp || !signature || !publicKeyHex || !/^[a-f\d]{64}$/i.test(publicKeyHex) || !/^[a-f\d]{128}$/i.test(signature)) return false;
  try {
    const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const publicKey = createPublicKey({ key: Buffer.concat([derPrefix, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), publicKey, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export function isDiscordInteractionAllowed(
  userId: string | undefined,
  channelId: string | undefined,
  allowedUsersRaw = process.env.DISCORD_ALLOWED_USER_IDS ?? "",
  allowedChannelsRaw = process.env.DISCORD_ALLOWED_CHANNEL_IDS ?? "",
) {
  const allowedUsers = new Set(allowedUsersRaw.split(",").map((id) => id.trim()).filter(Boolean));
  const allowedChannels = new Set(allowedChannelsRaw.split(",").map((id) => id.trim()).filter(Boolean));
  return Boolean(userId && allowedUsers.has(userId) && (allowedChannels.size === 0 || (channelId && allowedChannels.has(channelId))));
}
