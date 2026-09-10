import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("assistant")
    .setDescription("Send a message to the TinyPersonal assistant")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("Message or confirmation")
        .setRequired(true)
        .setMaxLength(2000),
    ),

  new SlashCommandBuilder()
    .setName("proxmox-status")
    .setDescription("Show Proxmox node health and resource usage")
    .addStringOption((option) =>
      option
        .setName("node")
        .setDescription("Proxmox node name (default: proxmox)")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("vm-status")
    .setDescription("Show all VMs or one VM on a Proxmox node")
    .addStringOption((option) =>
      option
        .setName("node")
        .setDescription("Proxmox node name (default: proxmox)")
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("vm_id")
        .setDescription("Optional VM ID")
        .setRequired(false)
        .setMinValue(100),
    ),

  new SlashCommandBuilder()
    .setName("vm")
    .setDescription("Propose a new Proxmox VM (confirmation is required)")
    .addStringOption((option) =>
      option.setName("node").setDescription("Proxmox node").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("vm_id").setDescription("Unique VM ID").setRequired(true).setMinValue(100),
    )
    .addStringOption((option) =>
      option.setName("name").setDescription("VM hostname").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("storage").setDescription("Proxmox storage ID").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("cores").setDescription("CPU cores").setMinValue(1).setMaxValue(128),
    )
    .addIntegerOption((option) =>
      option.setName("sockets").setDescription("CPU sockets").setMinValue(1).setMaxValue(8),
    )
    .addIntegerOption((option) =>
      option.setName("memory_mb").setDescription("Memory in MiB").setMinValue(128),
    )
    .addIntegerOption((option) =>
      option.setName("disk_gb").setDescription("Disk size in GiB").setMinValue(1),
    )
    .addStringOption((option) =>
      option.setName("bridge").setDescription("Network bridge (default vmbr0)"),
    )
    .addStringOption((option) =>
      option.setName("iso").setDescription("Optional volume ID, e.g. local:iso/debian.iso"),
    )
    .addStringOption((option) =>
      option
        .setName("os_type")
        .setDescription("Proxmox OS type")
        .addChoices(
          { name: "l26", value: "l26" },
          { name: "win10", value: "win10" },
          { name: "win11", value: "win11" },
          { name: "other", value: "other" },
        ),
    )
    .addBooleanOption((option) =>
      option.setName("on_boot").setDescription("Start VM automatically when node boots"),
    ),
];
