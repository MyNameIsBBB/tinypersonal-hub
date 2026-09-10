import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import {
  createPendingAction,
  executePendingAction,
  getProxmoxNodeStatus,
  listProxmoxVms,
  proxmoxCreateVmSchema,
} from "@tinypersonal/backend-api";

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function gib(value: number) {
  return `${(value / 1024 ** 3).toFixed(1)} GiB`;
}

function uptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export async function handleProxmoxStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const node = interaction.options.getString("node")?.trim() || "proxmox";
  const result = await getProxmoxNodeStatus(node);
  if (!result.ok) {
    await interaction.editReply(`Proxmox status failed: ${result.error.message}`);
    return;
  }
  const status = result.data;
  const content = [
    `Proxmox node **${status.node}**: ${status.status}`,
    `CPU: ${percent(status.cpuUsage)} (${status.cpuCores} cores)`,
    `Memory: ${gib(status.memoryUsed)} / ${gib(status.memoryTotal)}`,
    `Uptime: ${uptime(status.uptimeSeconds)}`,
    ...(status.loadAverage.length ? [`Load: ${status.loadAverage.join(" / ")}`] : []),
  ].join("\n");

  await interaction.editReply(content);
}

export async function handleVmStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const node = interaction.options.getString("node")?.trim() || "proxmox";
  const vmId = interaction.options.getInteger("vm_id") ?? undefined;
  const result = await listProxmoxVms(node, vmId);
  if (!result.ok) {
    await interaction.editReply(`VM status failed: ${result.error.message}`);
    return;
  }
  if (result.data.length === 0) {
    await interaction.editReply(
      vmId ? `VM ${vmId} was not found on ${node}.` : `No QEMU VMs found on ${node}.`,
    );
    return;
  }
  const lines = result.data.map(
    (vm) =>
      `**${vm.vmId} ${vm.name}** — ${vm.status} | CPU ${percent(vm.cpuUsage)} | RAM ${gib(vm.memoryUsed)}/${gib(vm.memoryTotal)} | up ${uptime(vm.uptimeSeconds)}`,
  );
  await interaction.editReply(lines.join("\n").slice(0, 2_000));
}

export async function handleVmCreate(interaction: ChatInputCommandInteraction, ownerKey: string) {
  const node = interaction.options.getString("node", true);
  const vmId = interaction.options.getInteger("vm_id", true);
  const name = interaction.options.getString("name", true);
  const storage = interaction.options.getString("storage", true);
  const cores = interaction.options.getInteger("cores") ?? 2;
  const sockets = interaction.options.getInteger("sockets") ?? 1;
  const memoryMb = interaction.options.getInteger("memory_mb") ?? 2048;
  const diskGb = interaction.options.getInteger("disk_gb") ?? 32;
  const bridge = interaction.options.getString("bridge") ?? "vmbr0";
  const iso = interaction.options.getString("iso") ?? undefined;
  const osType = interaction.options.getString("os_type") ?? "l26";
  const onBoot = interaction.options.getBoolean("on_boot") ?? false;

  const parsed = proxmoxCreateVmSchema.safeParse({
    node,
    vmId,
    name,
    storage,
    cores,
    sockets,
    memoryMb,
    diskGb,
    bridge,
    osType,
    onBoot,
    ...(iso ? { iso } : {}),
  });

  if (!parsed.success) {
    await interaction.reply({
      content: `Invalid VM settings: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const input = parsed.data;
  const action = await createPendingAction({
    ownerKey,
    toolName: "proxmox.createVm",
    summary: `Create Proxmox VM ${input.vmId} (${input.name}) on ${input.node}`,
    arguments: input,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`proxmox-vm:approve:${action.id}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`proxmox-vm:deny:${action.id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({
    content: `Confirm VM ${input.vmId} (${input.name}) on ${input.node}: ${input.cores} cores, ${input.memoryMb} MiB RAM, ${input.diskGb} GiB on ${input.storage}, bridge ${input.bridge}.`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleProxmoxButton(interaction: ButtonInteraction, ownerKey: string) {
  const match = /^proxmox-vm:(approve|deny):([A-Za-z0-9-]+)$/.exec(interaction.customId);
  if (!match) return;

  const approved = match[1] === "approve";
  const actionId = match[2];

  if (!approved) {
    const result = await executePendingAction(ownerKey, actionId, false);
    if (!result) {
      await interaction.update({ content: "This confirmation is invalid or expired.", components: [] });
      return;
    }
    await interaction.update({ content: "Proxmox VM creation cancelled.", components: [] });
    return;
  }

  await interaction.update({ content: "Creating Proxmox VM, please wait...", components: [] });

  try {
    const execution = await executePendingAction(ownerKey, actionId, true);
    if (!execution) {
      await interaction.editReply({ content: "This confirmation is invalid or expired." });
      return;
    }
    const result = execution.result as
      | { ok?: boolean; data?: { vmId?: number; node?: string; taskId?: string }; error?: { message?: string } }
      | null;

    const content = result?.ok
      ? `Proxmox accepted VM ${result.data?.vmId} on ${result.data?.node}. Task: ${result.data?.taskId}`
      : `Proxmox VM creation failed: ${result?.error?.message ?? "Unknown error"}`;

    await interaction.editReply({ content });
  } catch (error) {
    await interaction.editReply({
      content: `Proxmox VM creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
