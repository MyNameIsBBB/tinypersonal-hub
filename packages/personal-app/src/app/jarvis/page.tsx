"use client";

import { useChat } from "@ai-sdk/react";
import { CalendarDays, ExternalLink, LineChart, LoaderCircle, Mail, Mic, MicOff, RadioTower, Send, X } from "lucide-react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

const STORAGE_KEY = "jarvis_browser_state";
type BrowserState = { isOpen: boolean; currentUrl: string; title: string; displayMode: "IFRAME" | "EXTERNAL" };
const launchers = [
  { title: "Google Calendar", url: "https://calendar.google.com/", icon: CalendarDays },
  { title: "Gmail", url: "https://mail.google.com/", icon: Mail },
  { title: "Google Finance", url: "https://www.google.com/finance/", icon: LineChart },
] as const;
type RecognitionEvent = { results: { length: number; [index: number]: { isFinal?: boolean; 0: { transcript: string } } } };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void; onresult: ((event: RecognitionEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export default function JarvisPage() {
  const [browser, setBrowser] = useState<BrowserState>({ isOpen: false, currentUrl: "", title: "", displayMode: "IFRAME" });
  const [browserHydrated, setBrowserHydrated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [transcript, setTranscript] = useState("แตะพื้นที่ฝั่งซ้ายเพื่อเริ่มสนทนา");
  const [muted, setMuted] = useState(true);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<Recognition | null>(null);
  const mutedRef = useRef(true); const speakingRef = useRef(false); const busyRef = useRef(false);
  const seenActions = useRef(new Set<string>()); const spokenId = useRef<string | null>(null);
  const browserRef = useRef(browser); const sessionRef = useRef<string | null>(null);
  const { messages, sendMessage, setMessages, status, error } = useChat({ id: "tinypersonal-jarvis" });

  useEffect(() => { browserRef.current = browser; if (browserHydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(browser)); }, [browser, browserHydrated]);
  useEffect(() => { sessionRef.current = sessionId; }, [sessionId]);
  useEffect(() => { busyRef.current = status === "submitted" || status === "streaming"; }, [status]);

  const beginListening = useCallback(() => {
    if (mutedRef.current || speakingRef.current || busyRef.current || !recognitionRef.current) return;
    try { recognitionRef.current.start(); setListening(true); setTranscript("กำลังฟัง…"); } catch { /* recognition is already active */ }
  }, []);
  const stopListening = useCallback(() => { try { recognitionRef.current?.stop(); } catch { /* already stopped */ } setListening(false); }, []);

  const send = useCallback(async (text: string) => {
    const clean = text.trim(); if (!clean || busyRef.current) return;
    stopListening(); setInput(""); setTranscript(clean); busyRef.current = true;
    const view = browserRef.current;
    await sendMessage({ text: clean }, { body: { sessionId: sessionRef.current, voiceMode: true, jarvisMode: true, ...(view.isOpen && view.currentUrl ? { visionContext: { currentUrl: view.currentUrl, title: view.title || "Jarvis display" } } : {}) } });
  }, [sendMessage, stopListening]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { const value = JSON.parse(saved) as Partial<BrowserState>; if (typeof value.isOpen === "boolean" && typeof value.currentUrl === "string" && typeof value.title === "string") setBrowser({ isOpen: value.isOpen, currentUrl: value.currentUrl, title: value.title, displayMode: value.displayMode === "EXTERNAL" ? "EXTERNAL" : "IFRAME" }); } catch { localStorage.removeItem(STORAGE_KEY); }
    setBrowserHydrated(true);
    void fetch("/api/chat", { cache: "no-store" }).then(async (response) => { if (!response.ok) return; const data = await response.json() as { sessionId?: string | null; messages?: UIMessage[] }; setSessionId(data.sessionId ?? null); if (data.messages) setMessages(data.messages); });
  }, [setMessages]);

  useEffect(() => {
    const speechWindow = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) { setSpeechSupported(false); return; }
    const recognition = new Constructor(); recognition.lang = "th-TH"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onresult = (event) => { let text = ""; for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript; setTranscript(text.trim() || "กำลังฟัง…"); const last = event.results[event.results.length - 1]; if (last?.isFinal && text.trim()) void send(text); };
    recognition.onend = () => { setListening(false); if (!mutedRef.current && !speakingRef.current && !busyRef.current) window.setTimeout(beginListening, 250); };
    recognition.onerror = () => { setListening(false); if (!mutedRef.current) setTranscript("ไม่ได้ยินเสียง ลองพูดอีกครั้ง"); };
    recognitionRef.current = recognition; return () => { recognition.onend = null; recognition.abort(); recognitionRef.current = null; window.speechSynthesis?.cancel(); };
  }, [beginListening, send]);

  useEffect(() => {
    for (const message of messages) message.parts.forEach((part, index) => {
      if (!isToolUIPart(part) || part.state !== "output-available") return;
      const key = `${message.id}:${index}`; if (seenActions.current.has(key)) return;
      const output = part.output as { browserAction?: { type: "OPEN" | "CLOSE"; url?: string; title?: string; displayMode?: "IFRAME" | "EXTERNAL" } } | undefined;
      if (!output?.browserAction) return; seenActions.current.add(key);
      if (output.browserAction.type === "CLOSE") setBrowser({ isOpen: false, currentUrl: "", title: "", displayMode: "IFRAME" });
      else if (output.browserAction.url) setBrowser({ isOpen: true, currentUrl: output.browserAction.url, title: output.browserAction.title ?? "Jarvis display", displayMode: output.browserAction.displayMode ?? "IFRAME" });
    });
  }, [messages]);

  useEffect(() => {
    if (status !== "ready") return;
    const latest = [...messages].reverse().find((message) => message.role === "assistant"); if (!latest || latest.id === spokenId.current) return;
    const text = latest.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ").trim(); if (!text) { if (!mutedRef.current) beginListening(); return; }
    spokenId.current = latest.id; stopListening(); speakingRef.current = true; setTranscript(text); window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = "th-TH"; utterance.voice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th")) ?? null;
    utterance.onend = utterance.onerror = () => { speakingRef.current = false; if (!mutedRef.current) window.setTimeout(beginListening, 250); };
    window.speechSynthesis.speak(utterance);
  }, [messages, status, beginListening, stopListening]);

  function toggleMute(event: MouseEvent) { if ((event.target as HTMLElement).closest("button,input,a,iframe")) return; const next = !mutedRef.current; mutedRef.current = next; setMuted(next); if (next) { stopListening(); window.speechSynthesis.cancel(); speakingRef.current = false; setTranscript("ไมค์ถูกปิด — แตะเพื่อเปิด"); } else beginListening(); }
  function submit(event: FormEvent) { event.preventDefault(); void send(input); }
  function launchExternal(title: string, url: string) { setBrowser({ isOpen: true, currentUrl: url, title, displayMode: "EXTERNAL" }); }

  return <WorkspaceShell active="Jarvis Mode" title="Jarvis Interactive Workspace" subtitle="Hands-free assistant · Asia/Bangkok">
    <div className={`jarvis-split ${browser.isOpen ? "browser-open" : ""}`}>
      <section className="jarvis-core" onClick={toggleMute} aria-label={muted ? "แตะเพื่อเปิดไมค์" : "แตะเพื่อปิดไมค์"}>
        <div className="jarvis-status"><span><RadioTower size={14} /> JARVIS CORE</span><strong className={muted ? "muted" : listening ? "live" : "processing"}>{muted ? "MUTED" : listening ? "LISTENING" : status === "ready" ? "READY" : "PROCESSING"}</strong></div>
        <div className={`jarvis-orb ${listening ? "listening" : ""} ${muted ? "muted" : ""}`}><div className="orb-ring ring-one" /><div className="orb-ring ring-two" /><div className="orb-center">{muted ? <MicOff size={34} /> : <Mic size={34} />}</div></div>
        <div className="jarvis-wave" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ animationDelay: `${index * -45}ms` }} />)}</div>
        <div className="jarvis-dialog"><small>{error ? "CONNECTION ERROR" : speechSupported ? "LATEST DIALOGUE" : "VOICE UNAVAILABLE"}</small><p>{error ? error.message : transcript}</p></div>
        <form className="jarvis-command" onSubmit={submit} onClick={(event) => event.stopPropagation()}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="พิมพ์คำสั่งสำรอง…" /><button disabled={!input.trim() || status !== "ready"} aria-label="ส่งคำสั่ง">{status === "ready" ? <Send size={17} /> : <LoaderCircle className="spin-icon" size={17} />}</button></form>
        <div className="jarvis-launchers" onClick={(event) => event.stopPropagation()}>{launchers.map(({ title, url, icon: Icon }) => <button key={title} onClick={() => launchExternal(title, url)}><Icon size={14} /> {title}</button>)}</div>
        <p className="jarvis-tap-hint">{muted ? <><MicOff size={13} /> แตะพื้นที่นี้เพื่อเปิดไมค์</> : <><Mic size={13} /> แตะพื้นที่นี้เพื่อ Mute</>}</p>
      </section>
      <section className="jarvis-browser" aria-hidden={!browser.isOpen}>
        <header><div><small>DISPLAY WORKSPACE</small><strong>{browser.title || "Browser"}</strong></div><a href={browser.currentUrl} target="_blank" rel="noreferrer" aria-label="เปิดในแท็บใหม่"><ExternalLink size={16} /></a><button onClick={() => setBrowser({ isOpen: false, currentUrl: "", title: "", displayMode: "IFRAME" })} aria-label="ปิด Workspace"><X size={18} /></button></header>
        {browser.isOpen && browser.currentUrl && browser.displayMode === "IFRAME" && <iframe src={browser.currentUrl} title={browser.title || "Jarvis browser"} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />}
        {browser.isOpen && browser.currentUrl && browser.displayMode === "EXTERNAL" && <div className="jarvis-external-card"><div><ExternalLink size={28} /></div><small>SECURE EXTERNAL APP</small><h2>{browser.title}</h2><p>บริการนี้ไม่อนุญาตให้ฝังใน iframe เพื่อปกป้องบัญชีและ session ของคุณ กรุณาเปิดในแท็บของบริการโดยตรง</p><a href={browser.currentUrl} target="_blank" rel="noreferrer">เปิด {browser.title} <ExternalLink size={15} /></a></div>}
      </section>
    </div>
  </WorkspaceShell>;
}
