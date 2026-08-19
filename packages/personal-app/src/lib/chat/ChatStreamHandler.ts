import type { UIMessage } from "ai";
const maxMessages = 120; const maxContextMessages = 32; const maxContextCharacters = 32_000;
export function retainChatMessages(messages: UIMessage[]) { return messages.slice(-maxMessages); }
export function selectContextWindow(messages: UIMessage[]) { const selected: UIMessage[] = []; let characters = 0; for (let index = messages.length - 1; index >= 0 && selected.length < maxContextMessages; index--) { const message = messages[index]; const size = JSON.stringify(message).length; if (selected.length && characters + size > maxContextCharacters) break; selected.unshift(message); characters += size; } return selected; }
export function latestUserText(messages: UIMessage[]) { const message = [...messages].reverse().find(({ role }) => role === "user"); return message?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim() ?? ""; }
