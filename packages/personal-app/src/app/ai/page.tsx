"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CalendarPlus, FileSearch, KeyRound, LoaderCircle, Mic, MicOff, ShieldCheck, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

const suggestions = [
  { icon: CalendarPlus, text: "ตั้ง Routine วิ่งทุกวันจันทร์และพุธ 07:00 ถึงสิ้นเดือน" },
  { icon: FileSearch, text: "ค้นหาโน้ตเกี่ยวกับ Product Sync" },
  { icon: KeyRound, text: "ขอลิงก์เข้า GitHub จาก Vault" },
];

const CHAT_STORAGE_KEY = "tinypersonal.ai.chat";
const CHAT_IDLE_LIMIT_MS = 30 * 60 * 1000;

type StoredChatPayload = {
  messages: unknown[];
  lastActiveAt: number;
};

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
  const { messages, sendMessage, setMessages, status, error } = useChat({ id: "tinypersonal-ai-assistant" });
  const initialPromptSent = useRef(false);
  const initialized = useRef(false);
  const lastActiveAtRef = useRef(Date.now());
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceRequestPending = useRef(false);
  const lastSpokenMessageId = useRef<string | null>(null);

  function clearStoredChat() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  function persistChat(nextMessages: unknown[]) {
    if (typeof window === "undefined") return;
    const payload: StoredChatPayload = {
      messages: nextMessages,
      lastActiveAt: lastActiveAtRef.current,
    };
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
  }

  function touchActivity() {
    lastActiveAtRef.current = Date.now();
  }

  async function send(text: string, fromVoice = false) {
    if (!text.trim() || status === "submitted" || status === "streaming") return;
    touchActivity();
    setInput("");
    voiceRequestPending.current = fromVoice;
    await sendMessage({ text }, { body: { voiceMode: fromVoice } });
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
    recognition.lang = "th-TH"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      setInput(transcript.trim());
      const last = event.results[event.results.length - 1] as unknown as { isFinal?: boolean; 0: { transcript: string } };
      if (last?.isFinal) void send(transcript.trim(), true);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    return () => { recognition.stop(); recognitionRef.current = null; };
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
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) {
      initialized.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredChatPayload>;
      if (!Array.isArray(parsed.messages) || typeof parsed.lastActiveAt !== "number") {
        clearStoredChat();
        initialized.current = true;
        return;
      }

      const idleFor = Date.now() - parsed.lastActiveAt;
      if (idleFor >= CHAT_IDLE_LIMIT_MS) {
        clearStoredChat();
        setMessages([]);
        initialized.current = true;
        return;
      }

      lastActiveAtRef.current = parsed.lastActiveAt;
      setMessages(parsed.messages as Parameters<typeof setMessages>[0]);
    } catch {
      clearStoredChat();
    }

    initialized.current = true;
  }, [setMessages]);

  useEffect(() => {
    if (!initialized.current) return;
    persistChat(messages);
  }, [messages]);

  useEffect(() => {
    if (!initialized.current) return;
    const timer = window.setInterval(() => {
      if (status === "submitted" || status === "streaming") return;
      const idleFor = Date.now() - lastActiveAtRef.current;
      if (idleFor < CHAT_IDLE_LIMIT_MS) return;
      setMessages([]);
      clearStoredChat();
      lastActiveAtRef.current = Date.now();
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [setMessages, status]);

  useEffect(() => {
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt && !initialPromptSent.current) { initialPromptSent.current = true; void sendMessage({ text: prompt }); }
  }, [sendMessage]);

  return <WorkspaceShell active="AI Assistant" title="Tiny AI Assistant" subtitle="Gemini พร้อมช่วยจัดการ workspace ของคุณ">
    <section className="ai-workspace">
      <header className="ai-hero">
        <div className="ai-avatar"><img src="/tinypersonal-logo-192.png" alt="TinyPersonal AI" width="58" height="58" /></div>
        <div><span><Sparkles size={14} /> Gemini connected</span><h2>วันนี้ให้ช่วยอะไรดี?</h2><p>สั่งจัดตาราง ค้นโน้ต หรือค้น metadata และลิงก์จาก Vault ได้ด้วยภาษาธรรมชาติ</p></div>
      </header>

      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 ? <div className="ai-suggestions">
          {suggestions.map(({ icon: Icon, text }) => <button key={text} onClick={() => void send(text)}><Icon size={18} /><span>{text}</span></button>)}
        </div> : messages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}>
          <div className="message-avatar">{message.role === "assistant" ? <Bot size={17} /> : "P"}</div>
          <div>{message.parts.map((part, index) => part.type === "text" ? <p key={index}>{part.text}</p> : part.type.startsWith("tool-") ? <span className="tool-status" key={index}><LoaderCircle size={13} /> กำลังดำเนินการด้วยเครื่องมือ…</span> : null)}</div>
        </article>)}
        {(status === "submitted" || status === "streaming") && <div className="thinking"><LoaderCircle size={15} /> Gemini กำลังคิด…</div>}
        {error && <div className="chat-error">เชื่อมต่อ AI ไม่สำเร็จ: {error.message}</div>}
      </div>

      <div className="ai-composer-wrap">
        {listening && <div className="voice-listening-indicator" role="status"><span /> กำลังฟังเสียงภาษาไทย…</div>}
        <form className="ai-composer" onSubmit={submit}>
          <button type="button" className={`voice-button${listening ? " listening" : ""}`} onClick={toggleListening} disabled={!voiceAvailable || status === "submitted" || status === "streaming"} aria-label={voiceAvailable ? (listening ? "หยุดฟัง" : "พูดกับ AI") : "เบราว์เซอร์นี้ไม่รองรับการพูด"}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>
          <textarea value={input} onChange={(event) => { touchActivity(); setInput(event.target.value); }} placeholder="พิมพ์คำสั่ง เช่น เลื่อน Routine ฟิตเนสของอาทิตย์นี้…" rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
          <button type="button" className="voice-button" onClick={() => { window.speechSynthesis?.cancel(); setVoiceReply((enabled) => !enabled); }} aria-label={voiceReply ? "ปิดเสียงตอบกลับ" : "เปิดเสียงตอบกลับ"}>{voiceReply ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button type="submit" disabled={!input.trim() || status === "submitted" || status === "streaming"} aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>
        </form>
        <p><ShieldCheck size={12} /> เสียงจะถูกพิมพ์ลงแชต • AI เข้าถึง Vault ได้เฉพาะ metadata</p>
      </div>
    </section>
  </WorkspaceShell>;
}
