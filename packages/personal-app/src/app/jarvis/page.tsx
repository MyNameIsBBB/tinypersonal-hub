"use client";
import { useChat } from "@ai-sdk/react";
import { Bot, CheckCircle2, ChevronRight, Circle, Code2, Cpu, LoaderCircle, Send, Terminal, TriangleAlert, User, Zap } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

const quickActions = [
  { label: "เปิดแอร์ 25°C", prompt: "เปิดแอร์ entity climate.living_room และตั้งอุณหภูมิ 25°C", icon: Zap },
  { label: "เช็ก Uptime", prompt: "เช็ก uptime ของเซิร์ฟเวอร์ให้หน่อย", icon: Cpu },
  { label: "Git Status", prompt: "ตรวจสอบ Git status ของโปรเจกต์และสรุปให้ฉัน โดยไม่ push", icon: Code2 },
] as const;
type Log = { command: string; stdout: string; stderr: string; exitCode: number };
type ToolOutput = { ok?: boolean; error?: { code?: string; message?: string }; data?: unknown };
function textOf(message: UIMessage) { return message.parts.filter((part) => part.type === "text").map((part) => part.text).join(""); }

function ToolInspector({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part); const running = part.state === "input-streaming" || part.state === "input-available"; const failed = part.state === "output-error";
  const output = part.state === "output-available" ? part.output as ToolOutput : undefined;
  const logs: Log[] = output?.data && typeof output.data === "object" && "logs" in output.data ? ((output.data as { logs?: Log[] }).logs ?? []) : [];
  const isError = failed || output?.ok === false;
  return <details className={`jarvis-tool ${isError ? "error" : running ? "running" : "success"}`} open={isError}>
    <summary>{running ? <LoaderCircle className="spin-icon" size={14} /> : isError ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}<span>{name}</span><small>{running ? "EXECUTING" : isError ? "FAILED" : "COMPLETE"}</small><ChevronRight size={14} /></summary>
    <div className="jarvis-tool-body">
      {part.state === "input-available" && <pre><code>{JSON.stringify(part.input, null, 2)}</code></pre>}
      {part.state === "output-error" && <p className="jarvis-stderr">{part.errorText}</p>}
      {output?.error?.message && <p className="jarvis-stderr">[{output.error.code ?? "ERROR"}] {output.error.message}</p>}
      {logs.map((log, index) => <section key={`${log.command}-${index}`}><header><span>$ {log.command}</span><b>exit {log.exitCode}</b></header>{log.stdout && <pre className="jarvis-stdout"><code>{log.stdout}</code></pre>}{log.stderr && <pre className="jarvis-stderr"><code>{log.stderr}</code></pre>}</section>)}
      {!running && !isError && logs.length === 0 && <pre><code>{JSON.stringify(output?.data ?? output ?? { ok: true }, null, 2)}</code></pre>}
    </div>
  </details>;
}

export default function JarvisPage() {
  const [sessionId, setSessionId] = useState<string | null>(null); const [input, setInput] = useState(""); const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({ id: "tinypersonal-jarvis" });
  const busy = status === "submitted" || status === "streaming"; const steps = useMemo(() => messages.flatMap((message) => message.parts.filter(isToolUIPart)), [messages]);
  useEffect(() => { void fetch("/api/chat", { cache: "no-store" }).then(async (response) => { if (!response.ok) return; const data = await response.json() as { sessionId?: string | null; messages?: UIMessage[] }; setSessionId(data.sessionId ?? null); if (data.messages) setMessages(data.messages); }); }, [setMessages]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, status]);
  const send = useCallback(async (prompt: string) => { const text = prompt.trim(); if (!text || busy) return; setInput(""); await sendMessage({ text }, { body: { sessionId, jarvisMode: true } }); }, [busy, sendMessage, sessionId]);
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  return <WorkspaceShell active="Jarvis Mode" title="JARVIS // Command Nexus" subtitle="Cybernetic orchestration interface · Asia/Bangkok">
    <main className="jarvis-terminal-shell"><header className="jarvis-terminal-topbar"><div><i /><span>JARVIS CORE</span><small>v3.0 / SECURE CHANNEL</small></div><div className="jarvis-health"><span><Circle size={7} fill="currentColor" /> API ONLINE</span><span><Circle size={7} fill="currentColor" /> AGENT {busy ? "ACTIVE" : "READY"}</span></div></header>
      <div className="jarvis-terminal-grid"><section className="jarvis-chat-panel"><div className="jarvis-chat-scroll" ref={scrollRef}>
        {messages.length === 0 && <div className="jarvis-empty"><div><Bot size={30} /></div><small>AWAITING DIRECTIVE</small><h2>พร้อมรับคำสั่งครับ</h2><p>สั่งควบคุมอุปกรณ์ ตรวจระบบ หรือมอบหมายงานเขียนโค้ดได้จาก command line ด้านล่าง</p></div>}
        {messages.map((message) => <article className={`jarvis-message ${message.role}`} key={message.id}><div className="jarvis-avatar">{message.role === "user" ? <User size={15} /> : <Bot size={15} />}</div><div className="jarvis-message-content"><header><b>{message.role === "user" ? "OPERATOR" : "JARVIS"}</b><time>{message.role === "user" ? "DIRECTIVE" : "RESPONSE"}</time></header>{textOf(message) && <p>{textOf(message)}</p>}{message.parts.map((part, index) => <ToolInspector key={index} part={part} />)}</div></article>)}
        {status === "submitted" && <div className="jarvis-thinking"><LoaderCircle className="spin-icon" size={14} /> ANALYZING DIRECTIVE…</div>}
      </div>{error && <div className="jarvis-terminal-error"><TriangleAlert size={14} /> {error.message}</div>}
        <div className="jarvis-quick-actions">{quickActions.map(({ label, prompt, icon: Icon }) => <button key={label} disabled={busy} onClick={() => void send(prompt)}><Icon size={13} />{label}</button>)}</div>
        <form className="jarvis-terminal-input" onSubmit={submit}><Terminal size={18} /><span>›</span><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Enter directive…" autoComplete="off" />{busy ? <button type="button" onClick={stop}>STOP</button> : <button disabled={!input.trim()} aria-label="ส่งคำสั่ง"><Send size={16} /></button>}</form>
      </section><aside className="jarvis-telemetry"><header><Terminal size={14} /><span>EXECUTION TRACE</span><b>{steps.length}</b></header><div className="jarvis-trace-list">{steps.length === 0 ? <p>NO TOOL ACTIVITY</p> : steps.map((part, index) => <div key={index}><i className={part.state === "output-error" ? "error" : part.state === "output-available" ? "done" : "active"} /><span><b>STEP {String(index + 1).padStart(2, "0")}</b>{getToolName(part)}</span></div>)}</div><footer><span>SESSION</span><code>{sessionId?.slice(0, 12) ?? "CONNECTING"}</code><span>STREAM</span><code>{status.toUpperCase()}</code></footer></aside></div>
    </main>
  </WorkspaceShell>;
}
