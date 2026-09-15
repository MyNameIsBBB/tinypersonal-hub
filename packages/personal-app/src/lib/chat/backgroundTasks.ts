export const CHAT_TASKS_STORAGE_KEY = "tinypersonal_chat_tasks_v1";
export const ACTIVE_CHAT_SESSION_KEY = "tinypersonal_active_chat_session";
const CHAT_TASK_RETENTION_MS = 24 * 60 * 60_000;

export type ChatBackgroundTask = {
  sessionId: string;
  userMessageId: string;
  submittedAt: number;
  answeredAt?: number;
  notifiedAt?: number;
};

export function loadChatTasks(): ChatBackgroundTask[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(CHAT_TASKS_STORAGE_KEY) ?? "[]") as unknown;
    const oldestAllowed = Date.now() - CHAT_TASK_RETENTION_MS;
    return Array.isArray(value) ? value.filter((item): item is ChatBackgroundTask => Boolean(
      item
      && typeof item === "object"
      && "sessionId" in item
      && "userMessageId" in item
      && "submittedAt" in item
      && typeof item.submittedAt === "number"
      && item.submittedAt >= oldestAllowed,
    )) : [];
  } catch {
    return [];
  }
}

export function saveChatTasks(tasks: ChatBackgroundTask[]) {
  localStorage.setItem(CHAT_TASKS_STORAGE_KEY, JSON.stringify(tasks.slice(-30)));
  window.dispatchEvent(new Event("tinypersonal-chat-tasks-changed"));
}

export function registerChatTask(sessionId: string, userMessageId: string) {
  saveChatTasks([...loadChatTasks().filter((task) => task.userMessageId !== userMessageId), { sessionId, userMessageId, submittedAt: Date.now() }]);
}

export function markChatSessionActive(sessionId: string | null) {
  if (sessionId) localStorage.setItem(ACTIVE_CHAT_SESSION_KEY, sessionId);
  else localStorage.removeItem(ACTIVE_CHAT_SESSION_KEY);
}
