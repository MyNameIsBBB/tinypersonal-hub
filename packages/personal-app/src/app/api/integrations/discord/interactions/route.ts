import { createPublicKey, verify } from "node:crypto";
import { createPendingAction, ensureDailyGeneralChat, executePendingAction, proxmoxCreateVmSchema, saveUserMessageAndEnqueueChatGeneration } from "@tinypersonal/backend-api";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type DiscordOption = { name: string; value?: string | number | boolean };
type DiscordInteraction = {
  id?: string;
  application_id?: string;
  token?: string;
  type?: number;
  data?: { name?: string; options?: DiscordOption[] };
  message?: { id?: string };
  channel_id?: string;
  user?: { id?: string };
  member?: { user?: { id?: string } };
};

function ephemeral(content: string, status = 200) {
  return Response.json({ type: 4, data: { content, flags: 64 } }, { status });
}

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

function optionMap(options: DiscordOption[] = []) {
  return Object.fromEntries(options.map(({ name, value }) => [name, value]));
}

function vmInput(options: Record<string, unknown>) {
  return proxmoxCreateVmSchema.safeParse({
    node: options.node,
    vmId: options.vm_id,
    name: options.name,
    storage: options.storage,
    cores: options.cores ?? 2,
    sockets: options.sockets ?? 1,
    memoryMb: options.memory_mb ?? 2048,
    diskGb: options.disk_gb ?? 32,
    bridge: options.bridge ?? "vmbr0",
    osType: options.os_type ?? "l26",
    onBoot: options.on_boot ?? false,
    ...(options.iso ? { iso: options.iso } : {}),
  });
}

async function editOriginalResponse(applicationId: string, interactionToken: string, content: string) {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(interactionToken)}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 2_000), components: [] }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Discord response update returned HTTP ${response.status}`);
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyDiscordRequest(
    body,
    request.headers.get("x-signature-timestamp"),
    request.headers.get("x-signature-ed25519"),
  )) return new Response("Invalid request signature", { status: 401 });

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (interaction.type === 1) return Response.json({ type: 1 });
  if (interaction.type !== 2 && interaction.type !== 3) return ephemeral("Unsupported Discord interaction.");

  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const allowedUsers = new Set((process.env.DISCORD_ALLOWED_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  if (!userId || !allowedUsers.has(userId)) return ephemeral("This Discord account is not authorized to use TinyPersonal.");
  if (!interaction.id || !interaction.application_id || !interaction.token) return ephemeral("Discord interaction metadata is incomplete.");

  const ownerKey = process.env.DISCORD_OWNER_KEY?.trim() || `discord:${userId}`;
  if (interaction.type === 3) {
    const customId = (interaction.data as { custom_id?: string } | undefined)?.custom_id ?? "";
    const match = /^proxmox-vm:(approve|deny):([A-Za-z0-9-]+)$/.exec(customId);
    if (!match) return ephemeral("Unknown confirmation action.");
    const approved = match[1] === "approve";
    const actionId = match[2];
    if (!approved) {
      const result = await executePendingAction(ownerKey, actionId, false);
      return result
        ? Response.json({ type: 7, data: { content: "Proxmox VM creation cancelled.", components: [] } })
        : ephemeral("This confirmation is invalid or expired.");
    }
    after(async () => {
      let content: string;
      try {
        const execution = await executePendingAction(ownerKey, actionId, true);
        if (!execution) content = "This confirmation is invalid or expired.";
        else {
          const result = execution.result as { ok?: boolean; data?: { vmId?: number; node?: string; taskId?: string }; error?: { message?: string } } | null;
          content = result?.ok
            ? `Proxmox accepted VM ${result.data?.vmId} on ${result.data?.node}. Task: ${result.data?.taskId}`
            : `Proxmox VM creation failed: ${result?.error?.message ?? "Unknown error"}`;
        }
      } catch (error) {
        content = `Proxmox VM creation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
      await editOriginalResponse(interaction.application_id!, interaction.token!, content)
        .catch((error) => console.error("Discord response update failed", error instanceof Error ? error.message : error));
    });
    return Response.json({ type: 6 });
  }

  const options = optionMap(interaction.data?.options);
  if (interaction.data?.name === "vm") {
    const parsed = vmInput(options);
    if (!parsed.success) return ephemeral(`Invalid VM settings: ${parsed.error.issues[0]?.message ?? "validation failed"}`);
    const input = parsed.data;
    const action = await createPendingAction({
      ownerKey,
      toolName: "proxmox.createVm",
      summary: `Create Proxmox VM ${input.vmId} (${input.name}) on ${input.node}`,
      arguments: input,
    });
    return Response.json({
      type: 4,
      data: {
        flags: 64,
        content: `Confirm VM ${input.vmId} (${input.name}) on ${input.node}: ${input.cores} cores, ${input.memoryMb} MiB RAM, ${input.diskGb} GiB on ${input.storage}, bridge ${input.bridge}.`,
        components: [{
          type: 1,
          components: [
            { type: 2, style: 3, label: "Confirm", custom_id: `proxmox-vm:approve:${action.id}` },
            { type: 2, style: 4, label: "Cancel", custom_id: `proxmox-vm:deny:${action.id}` },
          ],
        }],
      },
    });
  }

  const text = interaction.data?.name === "assistant" && typeof options.prompt === "string"
    ? options.prompt.trim()
    : null;
  if (!text) return ephemeral("Missing or invalid command options.");
  const session = await ensureDailyGeneralChat(ownerKey);
  await saveUserMessageAndEnqueueChatGeneration({
    ownerKey,
    sessionId: session.id,
    message: { id: `discord-${interaction.id}`, role: "user", parts: [{ type: "text", text }] },
    request: {
      voiceMode: false,
      discordCallback: { applicationId: interaction.application_id, interactionToken: interaction.token },
    },
  });
  return Response.json({ type: 5, data: { flags: 64 } });
}
