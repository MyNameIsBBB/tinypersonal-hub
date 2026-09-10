import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  type Interaction,
} from "discord.js";
import { getProxmoxNodeStatus, listProxmoxVms } from "@tinypersonal/backend-api";
import { commands } from "./commands";
import {
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
      return `🟠 **Infrastructure status**\nProxmox: connection failed\nReason: ${error}\nUpdated: ${checkedAt}`;
    }
    const n = nodeResult.data;
    const gib = (value: number) => `${(value / 1024 ** 3).toFixed(1)} GiB`;
    const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
    const vms = vmResult.data.map((vm) =>
      `${vm.status === "running" ? "🟢" : "⚫"} **${vm.vmId} ${vm.name}** — ${vm.status} | CPU ${pct(vm.cpuUsage)} | RAM ${gib(vm.memoryUsed)}/${gib(vm.memoryTotal)}`,
    );
    return [
      `🟢 **Proxmox ${n.node}** — ${n.status}`,
      `CPU ${pct(n.cpuUsage)} | RAM ${gib(n.memoryUsed)}/${gib(n.memoryTotal)}`,
      "",
      "**Virtual machines**",
      ...(vms.length ? vms : ["No VMs found"]),
      "",
      `Updated: ${checkedAt}`,
    ].join("\n").slice(0, 2_000);
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
      if (channel?.isTextBased() && "send" in channel) {
        let statusMessage = await channel.send(await renderInfrastructureStatus()).catch(() => null);
        const intervalMs = Math.max(180_000, Number(process.env.DISCORD_STATUS_INTERVAL_MS) || 240_000);
        statusTimer = setInterval(async () => {
          const content = await renderInfrastructureStatus();
          if (statusMessage) {
            statusMessage = await statusMessage.edit(content).catch(() => null);
          }
          if (!statusMessage) statusMessage = await channel.send(content).catch(() => null);
        }, intervalMs);
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
      if (statusTimer) clearInterval(statusTimer);
      await client.destroy();
    },
  };
}
