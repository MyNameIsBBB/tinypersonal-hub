import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { ensureDailyGeneralChat, saveUserMessageAndEnqueueChatGeneration } from "@tinypersonal/backend-api";

export async function handleAssistant(interaction: ChatInputCommandInteraction, ownerKey: string) {
  const prompt = interaction.options.getString("prompt", true).trim();
  if (!prompt) {
    await interaction.reply({
      content: "Missing prompt.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const session = await ensureDailyGeneralChat(ownerKey);
  await saveUserMessageAndEnqueueChatGeneration({
    ownerKey,
    sessionId: session.id,
    message: {
      id: `discord-${interaction.id}`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
    },
    request: {
      voiceMode: false,
      discordCallback: {
        applicationId: interaction.applicationId,
        interactionToken: interaction.token,
      },
    },
  });

  // The chat generation worker will process the queue and PATCH the deferred response via webhook
}
