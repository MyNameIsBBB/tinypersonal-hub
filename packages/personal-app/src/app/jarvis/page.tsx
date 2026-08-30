"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CheckCircle2, ChevronRight, Code2, FolderKanban, LoaderCircle, MessageSquare, Plus, Trash2, TriangleAlert, User, X } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type Project = { id: string; title: string | null; updatedAt: string; _count: { messages: number } };
type Log = { command: string; stdout: string; stderr: string; exitCode: number };
type ToolOutput = { ok?: boolean; error?: { code?: string; message?: string }; data?: unknown; confirmation?: { id?: string; summary?: string }; confirmationRequired?: boolean; status?: string };
const GENERAL_CHAT_TITLE = "แชททั่วไป";

function ToolCard({ part, onConfirmed }: { part: UIMessage["parts"][number]; onConfirmed: () => void }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";
  const output = part.state === "output-available" ? part.output as ToolOutput : undefined;
  const logs: Log[] = output?.data && typeof output.data === "object" && "logs" in output.data ? ((output.data as { logs?: Log[] }).logs ?? []) : [];
  const confirmationId = output?.confirmation?.id;
  const decide = async (approved: boolean) => {
    if (!confirmationId) return;
    const response = await fetch(`/api/confirm/${encodeURIComponent(confirmationId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved }) });
    if (response.ok) onConfirmed();
  };
  return <details className={`jarvis-tool ${failed || output?.ok === false ? "error" : running ? "running" : "success"}`} open={failed || Boolean(confirmationId)}>
    <summary>{running ? <LoaderCircle className="spin-icon" size={14} /> : failed || output?.ok === false ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}<span>{name}</span><small>{running ? "กำลังทำงาน" : failed || output?.ok === false ? "ผิดพลาด" : confirmationId ? "รอยืนยัน" : "สำเร็จ"}</small><ChevronRight size={14} /></summary>
    <div className="jarvis-tool-body">
      {confirmationId && <div className="jarvis-confirm"><span>{output?.confirmation?.summary ?? name}</span><button onClick={() => void decide(false)}>ยกเลิก</button><button onClick={() => void decide(true)}>ยืนยัน</button></div>}
      {output?.error?.message && <p className="jarvis-stderr">[{output.error.code ?? "ERROR"}] {output.error.message}</p>}
      {part.state === "output-error" && <p className="jarvis-stderr">{part.errorText}</p>}
      {logs.map((log, index) => <section key={`${log.command}-${index}`}><header><span>$ {log.command}</span><b>exit {log.exitCode}</b></header>{log.stdout && <pre className="jarvis-stdout">{log.stdout}</pre>}{log.stderr && <pre className="jarvis-stderr">{log.stderr}</pre>}</section>)}
    </div>
  </details>;
}

export default function JarvisPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat({ id: "tinypersonal-jarvis" });
  const busy = status === "submitted" || status === "streaming";

  const loadProject = useCallback(async (id?: string, closePanel = true) => {
    const response = await fetch(`/api/chat${id ? `?sessionId=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { sessionId: string | null; sessions: Project[]; messages: UIMessage[] };
    setSessionId(data.sessionId); setProjects(data.sessions); setMessages(data.messages); if (closePanel) setProjectsOpen(false); setReady(true);
  }, [setMessages]);

  useEffect(() => { void loadProject(); }, [loadProject]);
  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" }); }, [messages, status]);
  useEffect(() => {
    if (!ready || !sessionId || status !== "ready") return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadProject(sessionId, false); }, 3_000);
    return () => window.clearInterval(timer);
  }, [loadProject, ready, sessionId, status]);

  const send = useCallback(async (prompt: string) => {
    const text = prompt.trim(); if (!ready || !sessionId || !text || busy) return;
    setInput(""); setLocalError(null); clearError();
    const message: UIMessage = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
    const checkpoint = await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, message }) });
    if (!checkpoint.ok) { setInput(text); setLocalError("บันทึกข้อความไม่สำเร็จ กรุณาลองอีกครั้ง"); return; }
    await sendMessage(message, { body: { sessionId, jarvisMode: true } });
  }, [busy, clearError, ready, sendMessage, sessionId]);
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }

  async function createProject() {
    const response = await fetch("/api/chat/sessions", { method: "POST" }); if (!response.ok) return;
    const data = await response.json() as { session: Project }; setSessionId(data.session.id); setMessages([]); setProjects((current) => [data.session, ...current]); setProjectsOpen(false);
  }
  async function removeProject(project: Project) {
    const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(project.id)}`, { method: "DELETE" });
    if (!response.ok) { setLocalError("ลบโปรเจกต์นี้ไม่ได้"); return; }
    await loadProject();
  }

  return <WorkspaceShell active="Jarvis Mode" title="JARVIS" subtitle="พื้นที่ทำงานและแชทแยกตามโปรเจกต์" focusMode immersive>
    <div className={`ai-chat-layout jarvis-project-layout ${projectsOpen ? "sessions-open" : ""}`}>
      <aside className="chat-sessions-panel" aria-hidden={!projectsOpen}>
        <div className="chat-sessions-header"><strong>โปรเจกต์</strong><button aria-label="ปิดรายการโปรเจกต์" onClick={() => setProjectsOpen(false)}><X size={19} /></button></div>
        <button className="new-chat-button" onClick={() => void createProject()}><Plus size={16} /> โปรเจกต์ใหม่</button>
        <div className="chat-session-list">{projects.map((project) => <div className={`chat-session-row ${project.id === sessionId ? "active" : ""}`} key={project.id}>
          <button onClick={() => void loadProject(project.id)}><FolderKanban size={14} /><span>{project.title || "โปรเจกต์ใหม่"}</span></button>
          {project.title !== GENERAL_CHAT_TITLE && <button className="delete-chat-button" aria-label="ลบโปรเจกต์" onClick={() => void removeProject(project)}><Trash2 size={13} /></button>}
        </div>)}</div>
      </aside>
      {projectsOpen && <button className="chat-sessions-scrim" aria-label="ปิดรายการโปรเจกต์" onClick={() => setProjectsOpen(false)} />}

      <section className="ai-workspace jarvis-chat-workspace">
        <header className="ai-chat-header"><button aria-label="เปิดรายการโปรเจกต์" onClick={() => setProjectsOpen(true)}><MessageSquare size={20} /></button><button aria-label="สร้างโปรเจกต์ใหม่" onClick={() => void createProject()}><Plus size={21} /></button></header>
        <div className="chat-thread" ref={threadRef} aria-live="polite">
          {messages.length === 0 && <div className="jarvis-chat-empty"><Bot size={32} /><h2>เริ่มคุยกับ JARVIS</h2><p>บทสนทนา เครื่องมือ และบริบททั้งหมดจะอยู่ภายในโปรเจกต์นี้</p></div>}
          {messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : <User size={16} />}</div><div>
            {message.parts.map((part, index) => part.type === "text" ? <MarkdownMessage key={index} text={part.text} /> : <ToolCard key={index} part={part} onConfirmed={() => void loadProject(sessionId ?? undefined, false)} />)}
          </div></article>)}
          {busy && <div className="thinking"><LoaderCircle size={15} /> JARVIS กำลังคิด…</div>}
          {(error || localError) && <div className="chat-error">{localError ?? error?.message}</div>}
        </div>
        <div className="ai-composer-wrap"><form className="ai-composer jarvis-composer" onSubmit={submit}><Code2 size={18} /><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={ready ? "ส่งข้อความถึง JARVIS…" : "กำลังโหลดโปรเจกต์…"} rows={2} disabled={!ready} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />{busy ? <button type="button" onClick={stop} aria-label="หยุด"><X size={18} /></button> : <button type="submit" disabled={!ready || !input.trim()} aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>}</form><p>แต่ละโปรเจกต์มีประวัติและบริบทแยกจากกัน</p></div>
      </section>
    </div>
  </WorkspaceShell>;
}
