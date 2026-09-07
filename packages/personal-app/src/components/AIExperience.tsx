"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CalendarPlus, Check, ChevronDown, CircleCheck, Clock3, Copy, Cpu, Database, FileSearch, KeyRound, LoaderCircle, Menu, MessageSquare, Mic, MicOff, Paperclip, Plus, Search, ShieldCheck, Sparkles, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { getToolName, isToolUIPart, type FileUIPart, type UIMessage, type UIMessagePart } from "ai";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { AppModal } from "@/components/AppModal";
import { markChatSessionActive, registerChatTask } from "@/lib/chat/backgroundTasks";
import { hasRenderableMessageContent, isChatGenerationPending, mergeServerMessages } from "@/lib/chat/ChatStreamHandler";

const suggestions = [
  { icon: CalendarPlus, text: "ตั้ง Routine วิ่งทุกวันจันทร์และพุธ 07:00 ถึงสิ้นเดือน" },
  { icon: FileSearch, text: "ค้นหาโน้ตเกี่ยวกับ Product Sync" },
  { icon: KeyRound, text: "ขอลิงก์เข้า GitHub จาก Vault" },
];

type CodingJobProgressEvent = { at: string; kind: "status" | "command" | "file" | "tool"; message: string };
type CodingJobProgress = { id: string; status: string; attempts: number; progressJson: string; createdAt: string; updatedAt: string; completedAt: string | null; error: string | null };
type ChatGenerationJobProgress = { id: string; userMessageId: string; status: string; attempts: number; createdAt: string; updatedAt: string; completedAt: string | null; error: string | null };
type ChatSessionSummary = { id: string; title: string | null; customSystemPrompt: string | null; updatedAt: string; _count: { messages: number } };
type SystemHealth = { ok: boolean; service: string; timestamp?: string; system?: { memoryUsedBytes: number; memoryTotalBytes: number; diskFreeBytes: number; diskTotalBytes: number; loadAverage1m: number; cpuCount: number; uptimeSeconds: number } };
type OScheduleItem = { id: string; title: string; startTime: string | null; status: string; type: string };
type ONote = { id: string; title: string; content: string; updatedAt: string };
const GENERAL_CHAT_TITLE = "แชททั่วไป";

function formatBytes(bytes: number) {
  const gib = bytes / 1024 / 1024 / 1024;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB`;
}

function speechText(text: string) {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1").replace(/https?:\/\/\S+/g, " ").replace(/[#*_~>|\[\]{}()]/g, " ").replace(/[•▪◦◆◇■□✓✔✅❌⚠️🔹🔸🎉🚀💡]/gu, " ").replace(/\s+/g, " ").trim();
}

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

function CodeBlockWrapper({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const copyCode = () => {
    if (!containerRef.current) return;
    const pre = containerRef.current.querySelector("pre");
    const text = pre?.textContent ?? "";
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container" ref={containerRef}>
      <div className="code-block-header">
        <button type="button" className="code-copy-btn" onClick={copyCode}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? "คัดลอกแล้ว" : "คัดลอกโค้ด"}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function renderMessageParts(
  parts: UIMessagePart<any, any>[],
  onConfirmAction?: (actionId: string, approved: boolean) => void,
) {
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
              pre: ({ children }) => <CodeBlockWrapper>{children}</CodeBlockWrapper>,
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
        return (
          <div className="tool-status confirmation" key={index}>
            <span>{output.confirmation.summary ?? toolName}</span>
            <button
              type="button"
              onClick={() => onConfirmAction?.(output.confirmation!.id!, false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => onConfirmAction?.(output.confirmation!.id!, true)}
            >
              ยืนยัน
            </button>
          </div>
        );
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

export function AIExperience({ mode = "chat" }: { mode?: "chat" | "os" }) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceReply, setVoiceReply] = useState(true);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat({ id: "tinypersonal-b1" });
  const messagesRef = useRef(messages);
  const initialPromptSent = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionTranscriptRef = useRef("");
  const recognitionSubmittedRef = useRef(false);
  const sendRef = useRef<(text: string, fromVoice?: boolean) => Promise<void>>(async () => undefined);
  const voiceRequestPending = useRef(false);
  const lastSpokenMessageId = useRef<string | null>(null);
  const checkpointedAssistantId = useRef<string | null>(null);
  const reloadedCodingJobId = useRef<string | null>(null);
  const reloadedChatGenerationJobId = useRef<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const generalCycleRef = useRef(new Date(Date.now() - 3_600_000).toISOString().slice(0, 10));
  const [historyReady, setHistoryReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [codingJob, setCodingJob] = useState<CodingJobProgress | null>(null);
  const [chatGenerationJob, setChatGenerationJob] = useState<ChatGenerationJobProgress | null>(null);
  const [showCodexProgress, setShowCodexProgress] = useState(false);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<ChatSessionSummary | null>(null);
  const [deleteBusySessionId, setDeleteBusySessionId] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [promptSaved, setPromptSaved] = useState(true);
  const [promptBusy, setPromptBusy] = useState(false);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [osSchedule, setOsSchedule] = useState<OScheduleItem[]>([]);
  const [osNotes, setOsNotes] = useState<ONote[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (mode !== "os") return;
    let cancelled = false;
    const loadOSData = async () => {
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 86_400_000);
      const [healthResponse, scheduleResponse, notesResponse] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch(`/api/schedule?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { cache: "no-store" }),
        fetch("/api/notes", { cache: "no-store" }),
      ]);
      if (cancelled) return;
      if (healthResponse.ok) setSystemHealth(await healthResponse.json() as SystemHealth);
      if (scheduleResponse.ok) {
        const data = await scheduleResponse.json() as { items?: OScheduleItem[] };
        setOsSchedule((data.items ?? []).filter((item) => item.status !== "COMPLETED" && item.status !== "CANCELLED").sort((a, b) => new Date(a.startTime ?? 0).getTime() - new Date(b.startTime ?? 0).getTime()));
      }
      if (notesResponse.ok) {
        const data = await notesResponse.json() as { notes?: ONote[] };
        setOsNotes((data.notes ?? []).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      }
    };
    void loadOSData();
    const timer = window.setInterval(() => void loadOSData(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [mode]);

  useEffect(() => {
    const activeSession = sessions.find((item) => item.id === sessionId);
    setCustomSystemPrompt(activeSession?.customSystemPrompt ?? "");
    setPromptSaved(true);
  }, [sessionId, sessions]);

  async function saveCustomSystemPrompt() {
    if (!sessionId || promptBusy) return;
    setPromptBusy(true);
    setPersistenceError(null);
    try {
      const response = await fetch("/api/chat/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, customSystemPrompt: customSystemPrompt.trim() || null }),
      });
      const data = await response.json() as { session?: ChatSessionSummary; error?: string };
      if (!response.ok || !data.session) throw new Error(data.error ?? "บันทึก System prompt ไม่สำเร็จ");
      setSessions((current) => current.map((item) => item.id === sessionId ? { ...item, customSystemPrompt: data.session!.customSystemPrompt } : item));
      setPromptSaved(true);
    } catch (saveError) {
      setPersistenceError(saveError instanceof Error ? saveError.message : "บันทึก System prompt ไม่สำเร็จ");
    } finally {
      setPromptBusy(false);
    }
  }

  const codingJobEvents = useMemo(() => {
    if (!codingJob?.progressJson) return [];
    try { return JSON.parse(codingJob.progressJson) as CodingJobProgressEvent[]; }
    catch { return []; }
  }, [codingJob?.progressJson]);

  const latestProgressEvent = codingJobEvents.at(-1);
  const activeCodingJob = codingJob?.status === "QUEUED" || codingJob?.status === "RUNNING" ? codingJob : null;
  const awaitingChatResponse = isChatGenerationPending(chatGenerationJob, now?.getTime());

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  async function handleConfirmAction(_actionId: string, approved: boolean) {
    if (status === "submitted" || status === "streaming") return;
    // Route button confirmations through the same chat path as typed confirmations.
    // The server resolves every pending action from the current proposal as one batch.
    void send(approved ? "ยืนยัน" : "ยกเลิก");
  }

  async function send(text: string, fromVoice = false) {
    const clean = text.trim();
    const voiceMode = fromVoice || mode === "os";
    const selectedImages = attachments;
    if (!historyReady || !sessionId || (!clean && selectedImages.length === 0) || status === "submitted" || status === "streaming") return;
    setInput("");
    clearError();
    setPersistenceError(null);
    voiceRequestPending.current = voiceMode;
    const message = {
      id: crypto.randomUUID(),
      role: "user" as const,
      parts: [...(clean ? [{ type: "text" as const, text: clean }] : []), ...selectedImages],
    };
    const checkpoint = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message, voiceMode }),
    });
    if (!checkpoint.ok) {
      setInput(clean);
      voiceRequestPending.current = false;
      setPersistenceError("บันทึกข้อความไม่สำเร็จ กรุณาลองส่งอีกครั้ง");
      return;
    }
    const checkpointResult = await checkpoint.json() as { jobId: string };
    const queuedAt = new Date().toISOString();
    setChatGenerationJob({
      id: checkpointResult.jobId,
      userMessageId: message.id,
      status: "QUEUED",
      attempts: 0,
      createdAt: queuedAt,
      updatedAt: queuedAt,
      completedAt: null,
      error: null,
    });
    setAttachments([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
    registerChatTask(sessionId, message.id);
    setSessions((current) => {
      const nowStr = new Date().toISOString();
      return current.map((s) => (s.id === sessionId ? { ...s, updatedAt: nowStr } : s));
    });
    await sendMessage(message, { body: { voiceMode, sessionId } });
  }

  sendRef.current = send;

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

  function speak(text: string, force = false) {
    const clean = speechText(text);
    if ((!voiceReply && !force) || !clean) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "th-TH";
      utterance.rate = 0.96;
      const voices = window.speechSynthesis.getVoices();
      const thaiVoice = voices.find((voice) => voice.lang.toLowerCase() === "th-th") ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("th"));
      if (thaiVoice) utterance.voice = thaiVoice;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    }
  }

  function toggleVoiceReply() {
    if (voiceReply) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      setVoiceReply(false);
    } else {
      setVoiceReply(true);
      speak("เปิดเสียงแล้วครับ", true);
    }
  }

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (listening) { recognition.stop(); setListening(false); } else {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      recognitionTranscriptRef.current = "";
      recognitionSubmittedRef.current = false;
      recognition.start();
      setListening(true);
    }
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
      recognitionTranscriptRef.current = transcript.trim();
      const last = event.results[event.results.length - 1] as unknown as { isFinal?: boolean; 0: { transcript: string } };
      if (last?.isFinal) {
        recognitionSubmittedRef.current = true;
        void sendRef.current(transcript.trim(), true);
      }
    };
    recognition.onend = () => {
      setListening(false);
      const transcript = recognitionTranscriptRef.current.trim();
      if (transcript && !recognitionSubmittedRef.current) {
        recognitionSubmittedRef.current = true;
        void sendRef.current(transcript, true);
      }
    };
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
    if (!latest || latest.id.startsWith("chat-queued-") || latest.id === lastSpokenMessageId.current) return;
    const text = latest.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim();
    if (!text) return;
    lastSpokenMessageId.current = latest.id;
    voiceRequestPending.current = false;
    void speak(text);
  }, [messages, status, voiceReply]);

  useEffect(() => {
    if (!historyReady || !sessionId || status !== "ready") return;
    const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    const hasContent = latestAssistant?.parts.some((part) => part.type !== "text" || part.text.trim().length > 0);
    if (!latestAssistant || latestAssistant.id.startsWith("chat-queued-") || !hasContent || checkpointedAssistantId.current === latestAssistant.id) return;
    checkpointedAssistantId.current = latestAssistant.id;
    void fetch("/api/chat/messages/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message: latestAssistant }),
    }).then((response) => {
      if (!response.ok && checkpointedAssistantId.current === latestAssistant.id) checkpointedAssistantId.current = null;
    }).catch(() => {
      if (checkpointedAssistantId.current === latestAssistant.id) checkpointedAssistantId.current = null;
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
    setChatGenerationJob(null);
    reloadedChatGenerationJobId.current = null;
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
    setChatGenerationJob(null);
    reloadedChatGenerationJobId.current = null;
    setMessages([]);
    setSessionId(data.session.id);
    setSessions((current) => [{ ...data.session, _count: { messages: 0 } }, ...current]);
  }

  async function removeSession(targetSessionId: string) {
    const target = sessions.find((session) => session.id === targetSessionId);
    if (!target || deleteBusySessionId) return;
    setDeleteBusySessionId(targetSessionId);
    try {
      const response = await fetch(`/api/chat?sessionId=${encodeURIComponent(targetSessionId)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ลบบทสนทนาไม่สำเร็จ");
      const refreshed = await fetch("/api/chat", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("ลบแล้ว แต่โหลดรายการบทสนทนาใหม่ไม่สำเร็จ");
      const data = await refreshed.json() as { sessionId: string; sessions: ChatSessionSummary[]; messages: Parameters<typeof setMessages>[0] };
      setSessions(data.sessions);
      if (sessionId === targetSessionId) {
        clearError();
        setChatGenerationJob(null);
        reloadedChatGenerationJobId.current = null;
        setSessionId(data.sessionId);
        setMessages(data.messages);
      }
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
      if (cancelled) return;
      setCodingJob((current) => current && current.id === data.job?.id && current.updatedAt === data.job?.updatedAt ? current : data.job);
      const terminal = data.job?.status === "SUCCEEDED" || data.job?.status === "FAILED";
      if (terminal && data.job && reloadedCodingJobId.current !== data.job.id && status === "ready") {
        const chatResponse = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!chatResponse.ok || cancelled) return;
        const chatData = await chatResponse.json() as { messages?: Parameters<typeof setMessages>[0] };
        if (Array.isArray(chatData.messages)) {
          reloadedCodingJobId.current = data.job.id;
          const merged = mergeServerMessages(messagesRef.current, chatData.messages);
          messagesRef.current = merged;
          setMessages(merged);
        }
      }
    };
    void poll();
    const interval = codingJob?.status === "RUNNING" ? 1500 : codingJob?.status === "QUEUED" ? 4000 : 30_000;
    const timer = window.setInterval(() => void poll(), interval);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [historyReady, sessionId, codingJob?.status, setMessages, status]);

  useEffect(() => {
    if (!historyReady || !sessionId) return;
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`/api/jobs/chat?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const data = await response.json() as { job: ChatGenerationJobProgress | null };
      if (cancelled) return;
      setChatGenerationJob((current) => current && current.id === data.job?.id && current.updatedAt === data.job?.updatedAt ? current : data.job);
      const terminal = data.job?.status === "SUCCEEDED" || data.job?.status === "FAILED";
      if (terminal && data.job && reloadedChatGenerationJobId.current !== data.job.id && status === "ready") {
        const chatResponse = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!chatResponse.ok || cancelled) return;
        const chatData = await chatResponse.json() as { messages?: Parameters<typeof setMessages>[0] };
        if (Array.isArray(chatData.messages)) {
          const merged = mergeServerMessages(messagesRef.current, chatData.messages);
          messagesRef.current = merged;
          setMessages(merged);
          const completedMessage = merged.find(({ id }) => id === `chat-job-${data.job!.id}`);
          if (hasRenderableMessageContent(completedMessage)) {
            reloadedChatGenerationJobId.current = data.job.id;
          }
        }
      }
    };
    void poll();
    const interval = awaitingChatResponse ? 1_500 : 30_000;
    const timer = window.setInterval(() => void poll(), interval);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [awaitingChatResponse, chatGenerationJob?.status, historyReady, sessionId, setMessages, status]);

  const [searchQuery, setSearchQuery] = useState("");

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orderedSessions;
    return orderedSessions.filter((s) => (s.title || "บทสนทนาใหม่").toLowerCase().includes(q));
  }, [orderedSessions, searchQuery]);

  const groupedSessions = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 86_400_000;
    const weekStart = todayStart - 6 * 86_400_000;

    const groups: { today: ChatSessionSummary[]; yesterday: ChatSessionSummary[]; week: ChatSessionSummary[]; older: ChatSessionSummary[] } = {
      today: [], yesterday: [], week: [], older: [],
    };

    for (const session of filteredSessions) {
      const time = new Date(session.updatedAt).getTime();
      if (time >= todayStart) groups.today.push(session);
      else if (time >= yesterdayStart) groups.yesterday.push(session);
      else if (time >= weekStart) groups.week.push(session);
      else groups.older.push(session);
    }
    return groups;
  }, [filteredSessions]);

  const renderSessionItem = (session: ChatSessionSummary) => (
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
            setDeleteSessionTarget(session);
          }}
          title="ลบบทสนทนา"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  const sidebarExtraContent = (
    <div className="sidebar-chat-section">
      <div className="sidebar-chat-header">
        <span>บทสนทนา</span>
        <button type="button" className="sidebar-new-chat-btn" onClick={() => void createSession()} title="แชตใหม่">
          <Plus size={14} /> <span>แชตใหม่</span>
        </button>
      </div>
      <div className="sidebar-search-wrap">
        <Search size={13} />
        <input
          type="text"
          placeholder="ค้นหาบทสนทนา..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="sidebar-search-input"
        />
        {searchQuery && (
          <button type="button" className="sidebar-search-clear" onClick={() => setSearchQuery("")} title="ล้างการค้นหา">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="sidebar-chat-list">
        {filteredSessions.length === 0 ? (
          <div className="sidebar-group-title">ไม่พบบทสนทนา</div>
        ) : (
          <>
            {groupedSessions.today.length > 0 && (
              <div className="sidebar-group">
                <span className="sidebar-group-title">วันนี้</span>
                {groupedSessions.today.map(renderSessionItem)}
              </div>
            )}
            {groupedSessions.yesterday.length > 0 && (
              <div className="sidebar-group">
                <span className="sidebar-group-title">เมื่อวานนี้</span>
                {groupedSessions.yesterday.map(renderSessionItem)}
              </div>
            )}
            {groupedSessions.week.length > 0 && (
              <div className="sidebar-group">
                <span className="sidebar-group-title">7 วันที่ผ่านมา</span>
                {groupedSessions.week.map(renderSessionItem)}
              </div>
            )}
            {groupedSessions.older.length > 0 && (
              <div className="sidebar-group">
                <span className="sidebar-group-title">เก่ากว่านั้น</span>
                {groupedSessions.older.map(renderSessionItem)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
  return (
    <WorkspaceShell active={mode === "os" ? "B1 OS" : "AI Assistant"} title={mode === "os" ? "B1 Voice OS" : "B1"} subtitle="ผู้ช่วยส่วนตัวของคุณ" focusMode immersive sidebarExtra={sidebarExtraContent}>
      {mode === "os" && <div className="voice-os">
        <header className="voice-os-topbar">
          <div className="voice-os-clock">
            <button type="button" className="voice-os-menu" aria-label="เปิดหรือปิด sidebar" onClick={() => window.dispatchEvent(new Event("tinypersonal:toggle-sidebar"))}><Menu size={16} /></button>
            <Clock3 size={14} />
            <strong>{now?.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) ?? "--:--"}</strong>
            <span>•</span>
            <span>{now?.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) ?? "Loading"}</span>
          </div>
          <div className="voice-session-picker">
            <MessageSquare size={13} />
            <select aria-label="เลือกแชท" value={sessionId ?? ""} onChange={(event) => void openSession(event.target.value)} disabled={!historyReady || status !== "ready"}>
              {orderedSessions.map((item) => <option value={item.id} key={item.id}>{item.title || "บทสนทนาใหม่"}</option>)}
            </select>
            <button type="button" onClick={() => void createSession()} aria-label="สร้างแชทใหม่"><Plus size={14} /></button>
          </div>
          <div className="voice-os-metrics"><span>LOAD <b>{systemHealth?.system ? systemHealth.system.loadAverage1m.toFixed(2) : "—"}</b></span><span>DISK FREE <b>{systemHealth?.system ? formatBytes(systemHealth.system.diskFreeBytes) : "—"}</b></span></div>
        </header>

        <div className="voice-os-grid">
          <aside className="voice-os-panel voice-os-telemetry">
            <div className="voice-os-panel-title"><span>SYS TELEMETRY</span><small>LIVE</small></div>
            <section>
              <h2><Database size={15} /> VM &amp; STORAGE</h2>
              <div className="telemetry-row"><span>RAM</span><strong>{systemHealth?.system ? `${formatBytes(systemHealth.system.memoryUsedBytes)} / ${formatBytes(systemHealth.system.memoryTotalBytes)}` : "กำลังโหลด"}</strong></div>
              <div className="meter"><i style={{ width: systemHealth?.system ? `${systemHealth.system.memoryUsedBytes / systemHealth.system.memoryTotalBytes * 100}%` : "0%" }} /></div>
              <div className="telemetry-row"><span>DISK</span><strong>{systemHealth?.system ? `${formatBytes(systemHealth.system.diskFreeBytes)} FREE` : "กำลังโหลด"}</strong></div>
              <div className="meter"><i style={{ width: systemHealth?.system ? `${(1 - systemHealth.system.diskFreeBytes / systemHealth.system.diskTotalBytes) * 100}%` : "0%" }} /></div>
            </section>
            <section>
              <h2><Database size={15} /> APPLICATION</h2>
              <div className="service-row"><i /><span><b>{systemHealth?.service ?? "TinyPersonal Hub"}</b><small>{systemHealth?.timestamp ? `ตรวจล่าสุด ${new Date(systemHealth.timestamp).toLocaleTimeString("th-TH")}` : "กำลังตรวจสอบ"}</small></span><em>{systemHealth?.ok ? "ONLINE" : "—"}</em></div>
              {systemHealth?.system && <div className="service-row"><i /><span><b>{systemHealth.system.cpuCount} CPU cores</b><small>Uptime {Math.floor(systemHealth.system.uptimeSeconds / 3600)} ชั่วโมง</small></span><em>LIVE</em></div>}
            </section>
            <section>
              <h2><Cpu size={15} /> CODEX WORKER</h2>
              <div className="worker-status"><span className={activeCodingJob ? "working" : ""}><i /></span><div><b>{activeCodingJob ? "Working" : "Idle"}</b><small>{activeCodingJob ? latestProgressEvent?.message ?? "กำลังประมวลผล" : "พร้อมรับคำสั่ง"}</small></div></div>
            </section>
            <footer><ShieldCheck size={14} /> PRIVATE • LOCAL-FIRST</footer>
          </aside>

          <main className="voice-os-center">
            <div className="voice-presence">
              <div className={`b1-avatar${listening ? " listening" : ""}${status !== "ready" ? " thinking" : ""}${speaking ? " speaking" : ""}`} aria-label={listening ? "B1 กำลังฟัง" : speaking ? "B1 กำลังพูด" : "B1 พร้อมทำงาน"}>
                <span className="avatar-halo halo-one" /><span className="avatar-halo halo-two" />
                <div className="b1-face"><span className="b1-eye left" /><span className="b1-eye right" /><span className="b1-mouth" /></div>
              </div>
              <div className="mood-pill"><i /> {listening ? "LISTENING" : speaking ? "SPEAKING" : status === "ready" ? "MOOD: FOCUSED" : "PROCESSING"}</div>
            </div>

            <div className="voice-wave" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -0.07}s` }} />)}</div>

            <div className="voice-dialog" aria-live="polite">
              <small>B1 / VOICE RESPONSE</small>
              <p>{messages.length === 0 ? "ระบบพร้อมทำงานครับ มีอะไรให้ผมรับใช้ไหมครับ" : [...messages].reverse().find((message) => message.role === "assistant")?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ") || (status === "ready" ? "พร้อมรับคำสั่งถัดไปครับ" : "กำลังประมวลผลคำสั่งของคุณครับ…")}</p>
            </div>

            <div className="voice-primary-actions">
              <button type="button" className={`speak-main${listening ? " listening" : ""}`} onClick={toggleListening} disabled={!historyReady || !voiceAvailable || status !== "ready"}>
                {listening ? <MicOff size={22} /> : <Mic size={22} />}<span>{listening ? "หยุดฟัง" : "พูดกับ B1"}<small>{voiceAvailable ? "THAI SPEECH INPUT" : "ไม่รองรับบนเบราว์เซอร์นี้"}</small></span>
              </button>
              <button type="button" className={`mute-main${!voiceReply ? " muted" : ""}`} onClick={toggleVoiceReply} aria-pressed={!voiceReply}>
                {voiceReply ? <Volume2 size={20} /> : <VolumeX size={20} />}<span>{voiceReply ? "เสียงเปิด" : "ปิดเสียง"}</span>
              </button>
            </div>

            <div className="voice-chat-dock">
              <div className="voice-transcript" ref={threadRef}>
                {messages.slice(-4).map((message) => <div className={message.role} key={message.id}><b>{message.role === "assistant" ? "B1" : "YOU"}</b><span>{message.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ")}</span></div>)}
                {(status === "submitted" || status === "streaming") && <div className="assistant"><b>B1</b><span>กำลังคิด…</span></div>}
                {(error || persistenceError) && <div className="voice-os-error">{persistenceError ?? `เชื่อมต่อ AI ไม่สำเร็จ: ${error!.message}`}</div>}
              </div>
              <form onSubmit={submit} className="voice-text-input">
                <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={listening ? "กำลังฟังเสียงภาษาไทย…" : "พิมพ์คำสั่ง หรือกดไมค์เพื่อพูด…"} disabled={!historyReady} />
                <button type="submit" disabled={!historyReady || !input.trim() || status !== "ready"} aria-label="ส่งข้อความ"><ArrowUp size={18} /></button>
              </form>
            </div>
          </main>

          <aside className="voice-os-panel voice-os-workspace">
            <div className="voice-os-panel-title"><span>WORKSPACE</span><small>{now?.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase() ?? "—"}</small></div>
            <section>
              <h2><Bot size={15} /> CUSTOM SYSTEM PROMPT</h2>
              <textarea className="system-prompt-input" value={customSystemPrompt} maxLength={8000} onChange={(event) => { setCustomSystemPrompt(event.target.value); setPromptSaved(false); }} placeholder="เช่น ตอบสั้น กระชับ และเรียกผมว่า Boss" />
              <div className="system-prompt-actions"><small>{customSystemPrompt.length.toLocaleString()}/8,000</small><button type="button" disabled={promptSaved || promptBusy || !sessionId} onClick={() => void saveCustomSystemPrompt()}>{promptBusy ? "กำลังบันทึก…" : promptSaved ? "บันทึกแล้ว" : "บันทึก Prompt"}</button></div>
            </section>
            <section>
              <h2><CircleCheck size={15} /> TODAY&apos;S FOCUS</h2>
              {osSchedule.filter((item) => item.status !== "COMPLETED" && item.status !== "CANCELLED").slice(0, 3).map((item) => <div className="os-real-item" key={item.id}><CircleCheck size={14} /><span>{item.title}<small>{item.startTime ? new Date(item.startTime).toLocaleString("th-TH", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : item.type}</small></span></div>)}
              {osSchedule.filter((item) => item.status !== "COMPLETED" && item.status !== "CANCELLED").length === 0 && <p className="os-empty-data">ยังไม่มีงานใน 7 วันข้างหน้า</p>}
            </section>
            <section>
              <h2><Clock3 size={15} /> NEXT SCHEDULE</h2>
              {osSchedule[0] ? <div className="schedule-block"><b>{osSchedule[0].startTime ? new Date(osSchedule[0].startTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "—"}</b><span>{osSchedule[0].title}<small>{osSchedule[0].startTime ? new Date(osSchedule[0].startTime).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short" }) : osSchedule[0].type}</small></span></div> : <p className="os-empty-data">ไม่มีตารางถัดไป</p>}
            </section>
            <section>
              <h2><Sparkles size={15} /> QUICK SCRATCH</h2>
              {osNotes[0] ? <div className="scratch-note"><p>{osNotes[0].title}</p><small>แก้ไข {new Date(osNotes[0].updatedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div> : <p className="os-empty-data">ยังไม่มีโน้ต</p>}
            </section>
            <div className="voice-tip"><Mic size={15} /><p><b>VOICE INPUT</b><span>{voiceAvailable ? "Speech recognition พร้อมใช้งาน" : "เบราว์เซอร์นี้ไม่รองรับ Speech recognition"}</span></p></div>
          </aside>
        </div>
      </div>}
      <div className={mode === "os" ? "voice-os-hidden-chat" : "ai-chat-layout"} aria-hidden={mode === "os"}>
        <section className="ai-workspace"><div className="chat-thread">
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
              {messages.filter((message) => message.role !== "assistant" || hasRenderableMessageContent(message)).map((message) => (
                <article className={`chat-message ${message.role}`} key={message.id}>
                  <div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : "P"}</div>
                  <div>{renderMessageParts(message.parts, (actionId, approved) => void handleConfirmAction(actionId, approved))}</div>
                </article>
              ))}
              </>
            )}

            {awaitingChatResponse && chatGenerationJob && (
              <div className="thinking" role="status"><LoaderCircle size={15} /> {chatGenerationJob.status === "QUEUED" ? "คำตอบอยู่ในคิวของเซิร์ฟเวอร์…" : chatGenerationJob.status === "RUNNING" ? "AI กำลังสร้างคำตอบที่เซิร์ฟเวอร์…" : "AI กำลังส่งคำตอบ…"}</div>
            )}

            {activeCodingJob && (
              <div className={`codex-status-card ${activeCodingJob.status.toLowerCase()}`}>
                <div className="codex-status-header">
                  <div className="codex-status-main">
                    {activeCodingJob.status === "QUEUED" || activeCodingJob.status === "RUNNING" ? (
                      <LoaderCircle size={15} className="spin" />
                    ) : null}
                    <div className="codex-status-info">
                      <span className="codex-title">
                        Codex: {activeCodingJob.status === "QUEUED" ? "กำลังจัดคิว" : (latestProgressEvent?.message ?? `กำลังทำงาน (รอบที่ ${activeCodingJob.attempts})`)}
                      </span>
                      {activeCodingJob.status === "RUNNING" && latestProgressEvent && (
                        <span className="codex-timestamp">
                          {new Date(latestProgressEvent.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                  {codingJobEvents.length > 0 && (
                    <button
                      type="button"
                      className="codex-toggle-btn"
                      onClick={() => setShowCodexProgress((prev) => !prev)}
                    >
                      {showCodexProgress ? "ซ่อนขั้นตอน" : `ดูขั้นตอน (${codingJobEvents.length})`}
                      <ChevronDown size={14} className={showCodexProgress ? "rotated" : ""} />
                    </button>
                  )}
                </div>

                {showCodexProgress && codingJobEvents.length > 0 && (
                  <div className="codex-progress-log">
                    {codingJobEvents.map((evt, idx) => (
                      <div className="codex-log-item" key={idx}>
                        <span className="log-kind-badge" data-kind={evt.kind}>
                          {evt.kind === "command" ? "💻" : evt.kind === "file" ? "📝" : evt.kind === "tool" ? "🛠️" : "🧠"}
                        </span>
                        <span className="log-message">{evt.message}</span>
                        <span className="log-time">
                          {new Date(evt.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
          </div></section>
      </div>
      <AppModal
        open={Boolean(deleteSessionTarget)}
        title="ลบบทสนทนานี้?"
        description={`บทสนทนา “${deleteSessionTarget?.title || "บทสนทนาใหม่"}” จะถูกลบถาวร`}
        tone="danger"
        confirmLabel="ลบบทสนทนา"
        cancelLabel="ยกเลิก"
        busy={Boolean(deleteBusySessionId)}
        onConfirm={async () => {
          if (deleteSessionTarget) {
            const id = deleteSessionTarget.id;
            setDeleteSessionTarget(null);
            await removeSession(id);
          }
        }}
        onClose={() => {
          if (!deleteBusySessionId) setDeleteSessionTarget(null);
        }}
      />
    </WorkspaceShell>
  );
}
