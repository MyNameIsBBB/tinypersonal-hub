"use client";

import { Bot, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ACTIVE_CHAT_SESSION_KEY, CHAT_TASKS_STORAGE_KEY, loadChatTasks, saveChatTasks, type ChatBackgroundTask } from "@/lib/chat/backgroundTasks";

type SessionUpdate = {
  id: string;
  title: string | null;
  messages: Array<{ messageId: string; role: string; createdAt: string }>;
};

export function BackgroundChatMonitor() {
  const [completed, setCompleted] = useState<Array<ChatBackgroundTask & { title: string }>>([]);

  const check = useCallback(async () => {
    const tasks = loadChatTasks();
    if (!tasks.length) { setCompleted([]); return; }
    const response = await fetch("/api/chat/sessions", { cache: "no-store" });
    if (!response.ok) return;
    const { sessions = [] } = await response.json() as { sessions?: SessionUpdate[] };
    const now = Date.now();
    const activeSession = localStorage.getItem(ACTIVE_CHAT_SESSION_KEY);
    const pageIsVisible = document.visibilityState === "visible" && location.pathname === "/ai";
    const next: ChatBackgroundTask[] = [];
    const unread: Array<ChatBackgroundTask & { title: string }> = [];

    for (const task of tasks) {
      const session = sessions.find(({ id }) => id === task.sessionId);
      const latest = session?.messages[0];
      const answered = latest?.role === "assistant" && new Date(latest.createdAt).getTime() >= task.submittedAt - 2_000;
      const updated = answered && !task.answeredAt ? { ...task, answeredAt: new Date(latest.createdAt).getTime() } : task;
      if (!updated.answeredAt) { next.push(updated); continue; }
      if (pageIsVisible && activeSession === task.sessionId) continue;

      const titled = { ...updated, title: session?.title || "บทสนทนาใหม่" };
      unread.push(titled);
      if (!updated.notifiedAt && now - updated.answeredAt >= 60_000) {
        try {
          if (Notification.permission === "granted") {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification("TinyPersonal ตอบแล้ว", {
              body: `ผลลัพธ์ใน “${titled.title}” พร้อมแล้ว`,
              icon: "/tinypersonal-logo-192.png",
              data: { url: `/ai?sessionId=${encodeURIComponent(task.sessionId)}` },
              tag: `chat-${task.sessionId}`,
            });
          }
        } catch { /* Keep the in-app unread indicator as fallback. */ }
        updated.notifiedAt = now;
      }
      next.push(updated);
    }
    localStorage.setItem(CHAT_TASKS_STORAGE_KEY, JSON.stringify(next.slice(-30)));
    setCompleted(unread);
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    const changed = () => void check();
    window.addEventListener("tinypersonal-chat-tasks-changed", changed);
    document.addEventListener("visibilitychange", changed);
    return () => { window.clearInterval(timer); window.removeEventListener("tinypersonal-chat-tasks-changed", changed); document.removeEventListener("visibilitychange", changed); };
  }, [check]);

  if (!completed.length) return null;
  const latest = completed.at(-1)!;
  return <div className="background-chat-alert" role="status">
    <Bot size={17} />
    <Link href={`/ai?sessionId=${encodeURIComponent(latest.sessionId)}`}>AI ตอบ “{latest.title}” แล้ว{completed.length > 1 ? ` · ${completed.length} รายการ` : ""}</Link>
    <button aria-label="ปิดการแจ้งเตือน" onClick={() => { saveChatTasks(loadChatTasks().filter(({ sessionId }) => sessionId !== latest.sessionId)); void check(); }}><X size={15} /></button>
  </div>;
}
