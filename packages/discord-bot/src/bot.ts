import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { commands } from "./commands";
import {
  handleProxmoxStatus,
  handleVmStatus,
  handleVmCreate,
  handleProxmoxButton,
} from "./handlers/proxmoxHandler";
import { handleAssistant } from "./handlers/assistantHandler";
import { isDiscordInteractionAllowed } from "./security";

export async function createDiscordBot(token = process.env.DISCORD_BOT_TOKEN) {
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required to start Discord bot.");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once("ready", async () => {
    console.log(`[Discord Bot] Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);

    // Register slash commands
    const applicationId = process.env.DISCORD_APPLICATION_ID || client.user?.id;
    if (applicationId) {
      const rest = new REST({ version: "10" }).setToken(token);
      const commandJson = commands.map((cmd) => cmd.toJSON());
      const guildId = process.env.DISCORD_GUILD_ID;

      try {
        if (guildId) {
          await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
            body: commandJson,
          });
          console.log(`[Discord Bot] Registered ${commands.length} slash commands in guild ${guildId}`);
        } else {
          await rest.put(Routes.applicationCommands(applicationId), {
            body: commandJson,
          });
          console.log(`[Discord Bot] Registered ${commands.length} global slash commands`);
        }
      } catch (error) {
        console.error("[Discord Bot] Failed to register slash commands:", error);
      }
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      const userId = interaction.user.id;
      const channelId = interaction.channelId ?? undefined;

      if (!isDiscordInteractionAllowed(userId, channelId)) {
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: "This Discord account or channel is not authorized to use TinyPersonal.",
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      const ownerKey = process.env.DISCORD_OWNER_KEY?.trim() || `discord:${userId}`;

      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === "assistant") {
          await handleAssistant(interaction, ownerKey);
        } else if (commandName === "proxmox-status") {
          await handleProxmoxStatus(interaction);
        } else if (commandName === "vm-status") {
          await handleVmStatus(interaction);
        } else if (commandName === "vm") {
          await handleVmCreate(interaction, ownerKey);
        }
        return;
      }

      if (interaction.isButton()) {
        await handleProxmoxButton(interaction, ownerKey);
        return;
      }
    } catch (error) {
      console.error("[Discord Bot] Interaction error:", error);
      if (interaction.isRepliable()) {
        const message = "An error occurred while executing this command.";
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: message }).catch(() => {});
        } else {
          await interaction
            .reply({ content: message, flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
      }
    }
  });

  return {
    client,
    start: async () => {
      await client.login(token);
    },
    stop: async () => {
      await client.destroy();
    },
  };
}
