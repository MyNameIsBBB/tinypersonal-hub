if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

import { createDiscordBot } from "./bot";

export * from "./bot";
export * from "./commands";
export * from "./security";

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/packages/discord-bot/src/index.ts") ||
  process.argv[1]?.endsWith("/packages/discord-bot/dist/index.js");

if (isMain || process.env.RUN_DISCORD_BOT === "1") {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("[Discord Bot] DISCORD_BOT_TOKEN is not set in environment. Exiting.");
    process.exit(1);
  }

  const bot = await createDiscordBot(token);
  await bot.start();

  const shutdown = async (signal: string) => {
    console.log(`[Discord Bot] Received ${signal}, shutting down...`);
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
