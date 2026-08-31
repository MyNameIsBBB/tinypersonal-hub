"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CalendarPlus, FileSearch, KeyRound, LoaderCircle, MessageSquare, Mic, MicOff, Paperclip, Plus, ShieldCheck, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { getToolName, isToolUIPart, type FileUIPart, type UIMessage, type UIMessagePart } from "ai";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { markChatSessionActive, registerChatTask } from "@/lib/chat/backgroundTasks";

const suggestions = [
  { icon: CalendarPlus, text: "ตั้ง Routine วิ่งทุกวันจันทร์และพุธ 07:00 ถึงสิ้นเดือน" },
  { icon: FileSearch, text: "ค้นหาโน้ตเกี่ยวกับ Product Sync" },
  { icon: KeyRound, text: "ขอลิงก์เข้า GitHub จาก Vault" },
];

type CodingJobProgress = { status: string; attempts: number; createdAt: string; updatedAt: string; completedAt: string | null; error: string | null };
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

function renderMessageParts(parts: UIMessagePart<any, any>[]) {
  const latestToolPartIndexByToolName = new Map<string, number>();
  parts.forEach((part, index) => {
    if (isToolUIPart(part)) {
      latestToolPartIndexByToolName.set(getToolName(part), index);
    }
  });

  return parts.map((part, index) => {
    if (part.type === "text") {
      return (
        <div className="chat-markdown" key={index}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath, normalizeAssistantMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
            }}
          >
            {part.text}
          </ReactMarkdown>
        </div>
      );
    }

    if (part.type === "file" && part.mediaType.startsWith("image/")) {
      return (
        <figure className="chat-image" key={index}>
          <img src={part.url} alt={part.filename ?? "รูปภาพที่แนบ"} />
        </figure>
      );
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
        return <div className="tool-status confirmation" key={index}><span>{output.confirmation.summary ?? toolName} — รอคำสั่งของท่านครับ โปรดพิมพ์ “ยืนยัน” เพื่อเริ่ม หรือ “ยกเลิก” เพื่อยุติภารกิจ</span></div>;
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
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat({ id: "tinypersonal-b1" });
  const initialPromptSent = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRequestPending = useRef(false);
  const lastSpokenMessageId = useRef<string | null>(null);
  const lastPersistedAssistantMessageId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const generalCycleRef = useRef(new Date(Date.now() - 3_600_000).toISOString().slice(0, 10));
  const [historyReady, setHistoryReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [codingJob, setCodingJob] = useState<CodingJobProgress | null>(null);
  const [deleteBusySessionId, setDeleteBusySessionId] = useState<string | null>(null);

  async function send(text: string, fromVoice = false) {
    const clean = text.trim();
    const selectedImages = attachments;
    if (!historyReady || !sessionId || (!clean && selectedImages.length === 0) || status === "submitted" || status === "streaming") return;
    setInput("");
    clearError();
    setPersistenceError(null);
    voiceRequestPending.current = fromVoice;
    const message = {
      id: crypto.randomUUID(),
      role: "user" as const,
      parts: [...(clean ? [{ type: "text" as const, text: clean }] : []), ...selectedImages],
    };
    const checkpoint = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!checkpoint.ok) {
      setInput(clean);
      voiceRequestPending.current = false;
      setPersistenceError("บันทึกข้อความไม่สำเร็จ กรุณาลองส่งอีกครั้ง");
      return;
    }
    setAttachments([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
    registerChatTask(sessionId, message.id);
    await sendMessage(message, { body: { voiceMode: fromVoice, sessionId } });
  }

  async function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const available = Math.max(0, 3 - attachments.length);
    const accepted = files.slice(0, available);
    if (files.length > available) setPersistenceError("แนบรูปได้สูงสุด 3 รูปต่อข้อความ");

    const parts: FileUIPart[] = [];
    for (const file of accepted) {
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        setPersistenceError("รองรับเฉพาะรูป JPEG, PNG, WebP และ GIF");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setPersistenceError(`รูป ${file.name} มีขนาดเกิน 5 MB`);
        continue;
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("อ่านรูปไม่สำเร็จ"));
        reader.readAsDataURL(file);
      });
      parts.push({ type: "file", mediaType: file.type, filename: file.name, url });
    }
    if (parts.length) {
      setPersistenceError(null);
      setAttachments((current) => [...current, ...parts].slice(0, 3));
    }
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
    if (!historyReady || !sessionId || status !== "ready") return;
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latest || latest.id === lastPersistedAssistantMessageId.current) return;
    const hasText = latest.parts.some((part) => part.type === "text" && part.text.trim().length > 0);
    if (!hasText) return;
    lastPersistedAssistantMessageId.current = latest.id;
    void fetch("/api/chat/messages/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: latest }),
    }).catch(() => {
      lastPersistedAssistantMessageId.current = null;
    });
  }, [historyReady, messages, sessionId, status]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const requested = new URLSearchParams(window.location.search).get("sessionId");
        const chatUrl = requested ? "/api/chat?sessionId=" + encodeURIComponent(requested) : "/api/chat";
        const response = await fetch(chatUrl, { method: "GET", cache: "no-store" });
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
      void send(prompt);
    }
  }, [historyReady, sessionId]);

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
    if (status === "submitted" || status === "streaming") stop();
    const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(nextSessionId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { sessionId: string; messages: Parameters<typeof setMessages>[0] };
    clearError();
    setSessionId(data.sessionId);
    setMessages(data.messages);
  }

  useEffect(() => {
    markChatSessionActive(sessionId);
    return () => {
      if (localStorage.getItem("tinypersonal_active_chat_session") === sessionId) markChatSessionActive(null);
    };
  }, [sessionId]);

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
    clearError();
    setMessages([]);
    setSessionId(data.session.id);
    setSessions((current) => [{ ...data.session, _count: { messages: 0 } }, ...current]);
  }

  async function removeSession(targetSessionId: string) {
    const target = sessions.find((session) => session.id === targetSessionId);
    if (!target || deleteBusySessionId) return;
    const approved = window.confirm(`ลบบทสนทนา “${target.title || "บทสนทนาใหม่"}” ใช่ไหม?`);
    if (!approved) return;
    setDeleteBusySessionId(targetSessionId);
    try {
      const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(targetSessionId)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ลบบทสนทนาไม่สำเร็จ");
      const refreshed = await fetch("/api/chat", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("ลบแล้ว แต่โหลดรายการบทสนทนาใหม่ไม่สำเร็จ");
      const data = await refreshed.json() as { sessionId: string; sessions: ChatSessionSummary[]; messages: Parameters<typeof setMessages>[0] };
      setSessions(data.sessions);
      if (sessionId === targetSessionId) { clearError(); setSessionId(data.sessionId); setMessages(data.messages); }
    } catch (deleteError) {
      setPersistenceError(deleteError instanceof Error ? deleteError.message : "ลบบทสนทนาไม่สำเร็จ กรุณาลองใหม่");
    } finally { setDeleteBusySessionId(null); }
  }


  useEffect(() => {
    if (!historyReady || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`/api/jobs/coding?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const data = await response.json() as { job: CodingJobProgress | null };
      if (!cancelled) setCodingJob(data.job);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [historyReady, sessionId]);

  const sidebarExtraContent = (
    <div className="sidebar-chat-section">
      <div className="sidebar-chat-header">
        <span>บทสนทนา</span>
        <button type="button" className="sidebar-new-chat-btn" onClick={() => void createSession()} title="แชตใหม่">
          <Plus size={14} /> <span>แชตใหม่</span>
        </button>
      </div>
      <div className="sidebar-chat-list">
        {sessions.map((session) => (
          <div className={`sidebar-chat-item ${session.id === sessionId ? "active" : ""}`} key={session.id}>
            <button type="button" className="sidebar-chat-link" onClick={() => void openSession(session.id)}>
              <MessageSquare size={14} />
              <span>{session.title || "บทสนทนาใหม่"}</span>
            </button>
            {session.title !== GENERAL_CHAT_TITLE && (
              <button
                type="button"
                className="sidebar-chat-delete"
                aria-label="ลบบทสนทนา"
                disabled={deleteBusySessionId === session.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void removeSession(session.id);
                }}
                title="ลบบทสนทนา"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>

  );
  return (
    <WorkspaceShell active="AI Assistant" title="B1" subtitle="ผู้ช่วยส่วนตัวของคุณ" focusMode immersive sidebarExtra={sidebarExtraContent}>
      <div className="ai-chat-layout">
        <section className="ai-workspace">
          <div className="chat-thread" aria-live="polite" ref={threadRef}>
            {codingJob && <div className={`tool-status ${codingJob.status === "FAILED" ? "error" : codingJob.status === "SUCCEEDED" ? "done" : "confirmation"}`}><LoaderCircle size={14} /> Codex: {codingJob.status === "QUEUED" ? "กำลังจัดคิว" : codingJob.status === "RUNNING" ? `กำลังทำงาน รอบที่ ${codingJob.attempts}` : codingJob.status === "SUCCEEDED" ? "เสร็จสิ้นแล้ว" : "ล้มเหลว — ตรวจสอบรายละเอียดในข้อความ"}</div>}
            {messages.length === 0 ? (
              <div className="ai-suggestions">
                {suggestions.map(({ icon: Icon, text }) => (
                  <button disabled={!historyReady} key={text} onClick={() => void send(text)}>
                    <Icon size={18} />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
              {messages.map((message) => (
                <article className={`chat-message ${message.role}`} key={message.id}>
                  <div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : "P"}</div>
                  <div>{renderMessageParts(message.parts)}</div>
                </article>
              ))}
              </>
            )}
            {(status === "submitted" || status === "streaming") && <div className="thinking"><LoaderCircle size={15} /> B1 กำลังคิด…</div>}
            {(error || persistenceError) && <div className="chat-error">{persistenceError ?? `เชื่อมต่อ AI ไม่สำเร็จ: ${error!.message}`}</div>}
          </div>

          <div className="ai-composer-wrap">
            {listening && <div className="voice-listening-indicator" role="status"><span /> กำลังฟังเสียงภาษาไทย…</div>}
            {attachments.length > 0 && (
              <div className="chat-attachment-preview">
                {attachments.map((attachment, index) => (
                  <div key={`${attachment.filename ?? "image"}-${index}`}>
                    <img src={attachment.url} alt={attachment.filename ?? "รูปที่เลือก"} />
                    <button type="button" aria-label={`นำ ${attachment.filename ?? "รูป"} ออก`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            <form className="ai-composer" onSubmit={submit}>
              <input ref={imageInputRef} className="chat-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => void addImages(event)} />
              <button type="button" className="attachment-button" onClick={() => imageInputRef.current?.click()} disabled={!historyReady || status === "submitted" || status === "streaming"} aria-label="แนบรูปภาพ"><Paperclip size={19} /></button>
              <button type="button" className={`voice-button${listening ? " listening" : ""}`} onClick={toggleListening} disabled={!historyReady || !voiceAvailable || status === "submitted" || status === "streaming"} aria-label={voiceAvailable ? (listening ? "หยุดฟัง" : "พูดกับ B1") : "เบราว์เซอร์นี้ไม่รองรับการพูด"}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
              <textarea disabled={!historyReady} value={input} onChange={(event) => setInput(event.target.value)} placeholder={historyReady ? "พิมพ์คำสั่ง เช่น เลื่อน Routine ฟิตเนสของอาทิตย์นี้…" : "กำลังโหลดบทสนทนา…"} rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
              <button type="button" className="voice-button voice-reply-button" onClick={() => { window.speechSynthesis?.cancel(); setVoiceReply((enabled) => !enabled); }} aria-label={voiceReply ? "ปิดเสียงตอบกลับ" : "เปิดเสียงตอบกลับ"}>{voiceReply ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
              <button type="submit" disabled={!historyReady || (!input.trim() && attachments.length === 0) || status === "submitted" || status === "streaming"} aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>
            </form>
            <p><ShieldCheck size={12} /> เสียงจะถูกพิมพ์ลงแชต • B1 เข้าถึง Vault ได้เฉพาะ metadata</p>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
