export function isDiscordInteractionAllowed(
  userId: string | undefined,
  channelId: string | undefined,
  allowedUsersRaw = process.env.DISCORD_ALLOWED_USER_IDS ?? "",
  allowedChannelsRaw = process.env.DISCORD_ALLOWED_CHANNEL_IDS ?? "",
): boolean {
  const allowedUsers = new Set(
    allowedUsersRaw.split(",").map((id) => id.trim()).filter(Boolean),
  );
  const allowedChannels = new Set(
    allowedChannelsRaw.split(",").map((id) => id.trim()).filter(Boolean),
  );

  // If no allowed users are specified, reject by default for safety
  if (allowedUsers.size === 0) return false;

  return Boolean(
    userId &&
      allowedUsers.has(userId) &&
      (allowedChannels.size === 0 || (channelId && allowedChannels.has(channelId))),
  );
}

export function isDiscordChannelAllowed(
  channelId: string | undefined,
  allowedChannelsRaw = process.env.DISCORD_ALLOWED_CHANNEL_IDS ?? "",
): boolean {
  const allowedChannels = new Set(
    allowedChannelsRaw.split(",").map((id) => id.trim()).filter(Boolean),
  );
  return allowedChannels.size > 0 && Boolean(channelId && allowedChannels.has(channelId));
}

export function isDiscordUserAllowed(
  userId: string | undefined,
  allowedUsersRaw = process.env.DISCORD_ALLOWED_USER_IDS ?? "",
): boolean {
  const allowedUsers = new Set(
    allowedUsersRaw.split(",").map((id) => id.trim()).filter(Boolean),
  );
  return allowedUsers.size > 0 && Boolean(userId && allowedUsers.has(userId));
}
