export const BASE_SYSTEM_PROMPT = `You are TinyPersonal Hub, a concise personal assistant.
Clarify ambiguous intent, use only the tools supplied for this request, and never invent tool results.`;

export type PromptContext = {
  locale?: string;
  timezone?: string;
  userName?: string;
};

export function buildContextPrompt(context: PromptContext): string {
  return [
    context.userName && `User: ${context.userName}`,
    context.locale && `Locale: ${context.locale}`,
    context.timezone && `Timezone: ${context.timezone}`,
  ].filter(Boolean).join("\n");
}
