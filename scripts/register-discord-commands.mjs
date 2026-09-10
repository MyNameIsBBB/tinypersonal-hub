const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!applicationId || !botToken) throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required");

const commands = [
  {
    name: "assistant",
    description: "Send a message to the TinyPersonal assistant",
    options: [{ type: 3, name: "prompt", description: "Message or confirmation", required: true, max_length: 2000 }],
  },
  {
    name: "vm",
    description: "Propose a new Proxmox VM (confirmation is required)",
    options: [
      { type: 3, name: "node", description: "Proxmox node", required: true },
      { type: 4, name: "vm_id", description: "Unique VM ID", required: true, min_value: 100 },
      { type: 3, name: "name", description: "VM hostname", required: true },
      { type: 3, name: "storage", description: "Proxmox storage ID", required: true },
      { type: 4, name: "cores", description: "CPU cores", min_value: 1, max_value: 128 },
      { type: 4, name: "sockets", description: "CPU sockets", min_value: 1, max_value: 8 },
      { type: 4, name: "memory_mb", description: "Memory in MiB", min_value: 128 },
      { type: 4, name: "disk_gb", description: "Disk size in GiB", min_value: 1 },
      { type: 3, name: "bridge", description: "Network bridge (default vmbr0)" },
      { type: 3, name: "iso", description: "Optional volume ID, e.g. local:iso/debian.iso" },
      { type: 3, name: "os_type", description: "Proxmox OS type", choices: ["l26", "win10", "win11", "other"].map((name) => ({ name, value: name })) },
      { type: 5, name: "on_boot", description: "Start VM automatically when the node boots" },
    ],
  },
];

const guildId = process.env.DISCORD_GUILD_ID;
const path = guildId
  ? `/applications/${applicationId}/guilds/${guildId}/commands`
  : `/applications/${applicationId}/commands`;
const response = await fetch(`https://discord.com/api/v10${path}`, {
  method: "PUT",
  headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});
if (!response.ok) throw new Error(`Discord command registration failed: HTTP ${response.status} ${await response.text()}`);
console.log(`Registered ${commands.length} Discord commands${guildId ? ` in guild ${guildId}` : " globally"}.`);
console.log(`Install URL: https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&scope=applications.commands`);
