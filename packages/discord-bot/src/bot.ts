import {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type Interaction,
  type Message,
} from "discord.js";
import { getProxmoxNodeStatus, listProxmoxVms } from "@tinypersonal/backend-api";
import { commands } from "./commands";
import {
  handleVmCreate,
  handleProxmoxButton,
} from "./handlers/proxmoxHandler";
import { handleAssistant } from "./handlers/assistantHandler";
import { isDiscordChannelAllowed, isDiscordUserAllowed } from "./security";

export async function createDiscordBot(token = process.env.DISCORD_BOT_TOKEN) {
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required to start Discord bot.");
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  let statusTimer: NodeJS.Timeout | undefined;

  const renderInfrastructureStatus = async () => {
    const nodeName = process.env.PROXMOX_NODE?.trim() || "proxmox";
    const [nodeResult, vmResult] = await Promise.all([
      getProxmoxNodeStatus(nodeName),
      listProxmoxVms(nodeName),
    ]);
    const checkedAt = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    if (!nodeResult.ok || !vmResult.ok) {
      const error = !nodeResult.ok ? nodeResult.error.message : !vmResult.ok ? vmResult.error.message : "Unknown error";
      return new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Infrastructure status")
        .setDescription(`⚠️ Proxmox connection failed\n\`${error.slice(0, 500)}\``)
        .setFooter({ text: `Updated ${checkedAt}` });
    }
    const n = nodeResult.data;
    const gib = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GiB`;
    const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
    const vms = vmResult.data.map((vm) =>
      `${vm.status === "running" ? "🟢" : "⚫"} **${vm.vmId} ${vm.name}** — ${vm.status} | CPU ${pct(vm.cpuUsage)} | RAM ${gib(vm.memoryUsed)}/${gib(vm.memoryTotal)}`,
    );
    return new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle(`Proxmox · ${n.node}`)
      .setDescription(`🟢 **${n.status.toUpperCase()}**`)
      .addFields(
        { name: "Host resources", value: `CPU  **${pct(n.cpuUsage)}**\nRAM  **${gib(n.memoryUsed)} / ${gib(n.memoryTotal)}**` },
        { name: `Virtual machines · ${vmResult.data.length}`, value: (vms.length ? vms : ["No VMs found"]).join("\n").slice(0, 1024) },
      )
      .setFooter({ text: `Auto-refresh every 4 minutes · Updated ${checkedAt}` });
  };

  client.once(Events.ClientReady, async () => {
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

    const statusChannelId = process.env.DISCORD_STATUS_CHANNEL_ID?.trim()
      || process.env.DISCORD_ALLOWED_CHANNEL_IDS?.split(",")[0]?.trim();
    if (statusChannelId) {
      const channel = await client.channels.fetch(statusChannelId).catch(() => null);
      if (channel?.isTextBased() && "send" in channel && "messages" in channel) {
        const cleanupOldStatusMessages = async (keepMessageId?: string) => {
          try {
            const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
            if (!fetched) return;
            const botMessages = fetched.filter(
              (msg) => msg.author.id === client.user?.id && msg.id !== keepMessageId,
            );
            for (const msg of botMessages.values()) {
              await msg.delete().catch(() => null);
            }
          } catch (error) {
            console.error("[Discord Bot] Failed to cleanup old status messages:", error);
          }
        };

        let statusMessage: Message | null = null;
        try {
          const fetched = await channel.messages.fetch({ limit: 20 }).catch(() => null);
          const existing = fetched
            ?.filter((msg) => msg.author.id === client.user?.id)
            .first();

          if (existing) {
            statusMessage = await existing.edit({ embeds: [await renderInfrastructureStatus()] }).catch(() => null);
            await cleanupOldStatusMessages(statusMessage?.id);
          }
        } catch {
          // fallback to sending new message
        }

        if (!statusMessage) {
          await cleanupOldStatusMessages();
          statusMessage = await channel.send({ embeds: [await renderInfrastructureStatus()] }).catch(() => null);
        }

        const intervalMs = Math.max(180_000, Number(process.env.DISCORD_STATUS_INTERVAL_MS) || 240_000);
        statusTimer = setInterval(async () => {
          const content = await renderInfrastructureStatus();
          if (statusMessage) {
            statusMessage = await statusMessage.edit({ embeds: [content] }).catch(() => null);
          }
          if (!statusMessage) {
            await cleanupOldStatusMessages();
            statusMessage = await channel.send({ embeds: [content] }).catch(() => null);
          }
        }, intervalMs);
      }
    }
  });

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      const userId = interaction.user.id;
      const channelId = interaction.channelId ?? undefined;

      if (!isDiscordChannelAllowed(channelId)) {
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
        } else if (commandName === "vm") {
          if (!isDiscordUserAllowed(userId)) {
            await interaction.reply({ content: "Only the authorized owner can create VMs.", flags: MessageFlags.Ephemeral });
            return;
          }
          await handleVmCreate(interaction, ownerKey);
        }
        return;
      }

      if (interaction.isButton()) {
        if (!isDiscordUserAllowed(userId)) {
          await interaction.reply({ content: "Only the authorized owner can confirm VM creation.", flags: MessageFlags.Ephemeral });
          return;
        }
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
      if (statusTimer) clearInterval(statusTimer);
      await client.destroy();
    },
  };
}
