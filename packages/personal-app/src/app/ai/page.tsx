"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CalendarPlus, FileSearch, KeyRound, LoaderCircle, MessageSquare, Mic, MicOff, Plus, ShieldCheck, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessagePart } from "ai";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { WorkspaceShell } from "@/components/WorkspaceShell";

const suggestions = [
  { icon: CalendarPlus, text: "ตั้ง Routine วิ่งทุกวันจันทร์และพุธ 07:00 ถึงสิ้นเดือน" },
  { icon: FileSearch, text: "ค้นหาโน้ตเกี่ยวกับ Product Sync" },
  { icon: KeyRound, text: "ขอลิงก์เข้า GitHub จาก Vault" },
];

type ChatSessionSummary = { id: string; title: string | null; updatedAt: string; _count: { messages: number } };
const GENERAL_CHAT_TITLE = "แชททั่วไป";

type MarkdownNode = { type?: string; value?: unknown; children?: MarkdownNode[] };

function normalizeAssistantMath() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") {
        node.value = node.value.replace(/(^|[^\\])%/g, "$1\\%");
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

function renderMessageParts(parts: UIMessagePart<any, any>[], decide: (id: string, approved: boolean) => void) {
  const latestToolPartIndexByToolName = new Map<string, number>();
  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      latestToolPartIndexByToolName.set(getToolName(part), index);
    }
  });

  return parts.map((part, index) => {
    if (part.type === "text") {
      return <div className="chat-markdown" key={index}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath, normalizeAssistantMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
          }}
        >{part.text}</ReactMarkdown>
      </div>;
    }

    if (!isToolUIPart(part)) {
      return null;
    }

    // The model may retry the same tool multiple times; only show the latest status for each tool name.
    const toolName = getToolName(part);
    if (latestToolPartIndexByToolName.get(toolName) !== index) {
      return null;
    }

    if (part.state === "output-available") {
      const output = part.output as { ok?: boolean; error?: { message?: string }; confirmation?: { id?: string; summary?: string }; confirmationRequired?: boolean; status?: string } | undefined;
      if (output?.confirmation?.id && (output.confirmationRequired || output.status === "confirmation-required")) {
        return <div className="tool-status" key={index}><span>{output.confirmation.summary ?? `ยืนยัน ${toolName}`}</span><button onClick={() => decide(output.confirmation!.id!, false)}>ยกเลิก</button><button onClick={() => decide(output.confirmation!.id!, true)}>ยืนยัน</button></div>;
      }
      if (output?.ok === false) return <div className="tool-status error" key={index}>เครื่องมือ {toolName} ขัดข้อง: {output.error?.message ?? "ไม่สามารถดึงข้อมูลได้"}</div>;
      return <div className="tool-status done" key={index}>ใช้เครื่องมือ {toolName} สำเร็จ</div>;
    }

    if (part.state === "output-error" || part.state === "output-denied") {
      return <div className="tool-status error" key={index}>เครื่องมือ {toolName} มีปัญหา: {part.errorText ?? "ดำเนินการไม่สำเร็จ"}</div>;
    }

    return <div className="tool-status" key={index}><LoaderCircle size={13} /> กำลังดำเนินการด้วยเครื่องมือ {toolName}…</div>;
  });
}

type SpeechRecognitionEventLike = { results: { [index: number]: { [index: number]: { transcript: string } }; length: number } };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  start(): void; stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};

export default function AIPage() {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceReply, setVoiceReply] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const { messages, sendMessage, setMessages, status, error, clearError } = useChat({ id: "tinypersonal-ai-assistant" });
  const initialPromptSent = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRequestPending = useRef(false);
  const lastSpokenMessageId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const generalCycleRef = useRef(new Date(Date.now() - 3_600_000).toISOString().slice(0, 10));
  const [historyReady, setHistoryReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);

  async function send(text: string, fromVoice = false) {
    const clean = text.trim();
    if (!historyReady || !sessionId || !clean || status === "submitted" || status === "streaming") return;
    setInput("");
    clearError();
    setPersistenceError(null);
    voiceRequestPending.current = fromVoice;
    const message = { id: crypto.randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text: clean }] };
    const checkpoint = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
      keepalive: true,
    });
    if (!checkpoint.ok) {
      setInput(clean);
      voiceRequestPending.current = false;
      setPersistenceError("บันทึกข้อความไม่สำเร็จ กรุณาลองส่งอีกครั้ง");
      return;
    }
    await sendMessage(message, { body: { voiceMode: fromVoice, sessionId } });
  }

  async function speak(text: string) {
    if (!voiceReply || !text.trim()) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "th-TH";
      const thaiVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));
      if (thaiVoice) utterance.voice = thaiVoice;
      window.speechSynthesis.speak(utterance);
    }
  }

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) { recognition.stop(); setListening(false); } else { recognition.start(); setListening(true); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  useEffect(() => {
    const speechWindow = window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    setVoiceAvailable(Boolean(Recognition));
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = "th-TH";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setInput(transcript.trim());
      const last = event.results[event.results.length - 1] as unknown as { isFinal?: boolean; 0: { transcript: string } };
      if (last?.isFinal) {
        void send(transcript.trim(), true);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status !== "ready" || !voiceRequestPending.current) return;
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latest || latest.id === lastSpokenMessageId.current) return;
    const text = latest.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
    if (!text) return;
    lastSpokenMessageId.current = latest.id;
    voiceRequestPending.current = false;
    void speak(text);
  }, [messages, status, voiceReply]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const response = await fetch("/api/chat", { method: "GET", cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { sessionId?: string | null; sessions?: ChatSessionSummary[]; messages?: Parameters<typeof setMessages>[0] };
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
          setSessionId(data.sessionId ?? null);
          setSessions(data.sessions ?? []);
        }
      } finally {
        if (!cancelled) {
          setHistoryReady(true);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [setMessages]);

  useEffect(() => {
    if (!historyReady) return;
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt && !initialPromptSent.current) {
      initialPromptSent.current = true;
      void sendMessage({ text: prompt }, { body: { sessionId } });
    }
  }, [historyReady, sendMessage, sessionId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (!historyReady || status !== "ready" || messages.length === 0) return;
    void fetch("/api/chat/sessions", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { sessions?: ChatSessionSummary[] } | null) => { if (data?.sessions) setSessions(data.sessions); });
  }, [historyReady, messages.length, status]);

  async function openSession(nextSessionId: string) {
    const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(nextSessionId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { sessionId: string; messages: Parameters<typeof setMessages>[0] };
    clearError(); setSessionId(data.sessionId); setMessages(data.messages); setSessionsOpen(false);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      const cycle = new Date(Date.now() - 3_600_000).toISOString().slice(0, 10);
      if (cycle === generalCycleRef.current || status !== "ready") return;
      generalCycleRef.current = cycle;
      const general = sessions.find(({ title }) => title === GENERAL_CHAT_TITLE);
      if (general && general.id === sessionId) void openSession(general.id);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [sessionId, sessions, status]);

  async function createSession() {
    const response = await fetch("/api/chat/sessions", { method: "POST" });
    if (!response.ok) return;
    const data = await response.json() as { session: ChatSessionSummary };
    clearError(); setMessages([]); setSessionId(data.session.id);
    setSessions((current) => [{ ...data.session, _count: { messages: 0 } }, ...current]);
    setSessionsOpen(false);
  }

  async function removeSession(targetSessionId: string) {
    if (!window.confirm("ลบบทสนทนานี้หรือไม่?")) return;
    const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(targetSessionId)}`, { method: "DELETE" });
    if (!response.ok) return;
    const remaining = sessions.filter(({ id }) => id !== targetSessionId);
    setSessions(remaining);
    if (sessionId === targetSessionId) {
      clearError();
      if (remaining[0]) await openSession(remaining[0].id);
      else await createSession();
    }
  }
  async function decideAction(id: string, approved: boolean) {
    const response = await fetch(`/api/confirm/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved }) });
    if (!response.ok) window.alert((await response.json() as { error?: string }).error ?? "ยืนยันรายการไม่สำเร็จ");
    else window.alert(approved ? "ดำเนินการเรียบร้อยแล้ว" : "ยกเลิกรายการแล้ว");
  }

  return <WorkspaceShell active="AI Assistant" title="Tiny AI" subtitle="พื้นที่สนทนาส่วนตัว" focusMode immersive>
    <div className={`ai-chat-layout ${sessionsOpen ? "sessions-open" : ""}`}>
      <aside className="chat-sessions-panel" aria-hidden={!sessionsOpen}>
        <div className="chat-sessions-header"><strong>บทสนทนา</strong><button aria-label="ปิดประวัติแชท" onClick={() => setSessionsOpen(false)}><X size={19} /></button></div>
        <button className="new-chat-button" onClick={() => void createSession()}><Plus size={16} /> แชตใหม่</button>
        <div className="chat-session-list">
          {sessions.map((session) => <div className={`chat-session-row ${session.id === sessionId ? "active" : ""}`} key={session.id}>
            <button onClick={() => void openSession(session.id)}><MessageSquare size={14} /><span>{session.title || "บทสนทนาใหม่"}{session.title === GENERAL_CHAT_TITLE ? " · รีเซ็ต 08:00" : ""}</span></button>
            {session.title !== GENERAL_CHAT_TITLE && <button className="delete-chat-button" aria-label="ลบบทสนทนา" onClick={() => void removeSession(session.id)}><Trash2 size={13} /></button>}
          </div>)}
        </div>
      </aside>
      {sessionsOpen && <button className="chat-sessions-scrim" aria-label="ปิดประวัติแชท" onClick={() => setSessionsOpen(false)} />}
      <section className="ai-workspace">
      <header className="ai-chat-header">
        <button aria-label="เปิดประวัติแชท" title="ประวัติแชท" onClick={() => setSessionsOpen(true)}><MessageSquare size={20} /></button>
        <div><img src="/tinypersonal-logo-192.png" alt="" width="28" height="28" /><span><strong>Tiny AI</strong><small>พร้อมสนทนา</small></span></div>
        <button aria-label="เริ่มแชทใหม่" title="แชทใหม่" onClick={() => void createSession()}><Plus size={21} /></button>
      </header>

      <div className="chat-thread" aria-live="polite" ref={threadRef}>
        {messages.length === 0 ? <div className="ai-suggestions">
          {suggestions.map(({ icon: Icon, text }) => <button disabled={!historyReady} key={text} onClick={() => void send(text)}><Icon size={18} /><span>{text}</span></button>)}
        </div> : messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}>
          <div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : "P"}</div>
          <div>{renderMessageParts(message.parts, (id, approved) => void decideAction(id, approved))}</div>
        </article>)}
        {(status === "submitted" || status === "streaming") && <div className="thinking"><LoaderCircle size={15} /> Gemini กำลังคิด…</div>}
        {(error || persistenceError) && <div className="chat-error">{persistenceError ?? `เชื่อมต่อ AI ไม่สำเร็จ: ${error!.message}`}</div>}
      </div>

      <div className="ai-composer-wrap">
        {listening && <div className="voice-listening-indicator" role="status"><span /> กำลังฟังเสียงภาษาไทย…</div>}
        <form className="ai-composer" onSubmit={submit}>
          <button type="button" className={`voice-button${listening ? " listening" : ""}`} onClick={toggleListening} disabled={!historyReady || !voiceAvailable || status === "submitted" || status === "streaming"} aria-label={voiceAvailable ? (listening ? "หยุดฟัง" : "พูดกับ AI") : "เบราว์เซอร์นี้ไม่รองรับการพูด"}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
          <textarea disabled={!historyReady} value={input} onChange={(event) => setInput(event.target.value)} placeholder={historyReady ? "พิมพ์คำสั่ง เช่น เลื่อน Routine ฟิตเนสของอาทิตย์นี้…" : "กำลังโหลดบทสนทนา…"} rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
          <button type="button" className="voice-button" onClick={() => { window.speechSynthesis?.cancel(); setVoiceReply((enabled) => !enabled); }} aria-label={voiceReply ? "ปิดเสียงตอบกลับ" : "เปิดเสียงตอบกลับ"}>{voiceReply ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button type="submit" disabled={!historyReady || !input.trim() || status === "submitted" || status === "streaming"} aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>
        </form>
        <p><ShieldCheck size={12} /> เสียงจะถูกพิมพ์ลงแชต • AI เข้าถึง Vault ได้เฉพาะ metadata</p>
      </div>
      </section>
    </div>
  </WorkspaceShell>;
}
