"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, Bot, CalendarPlus, FileSearch, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

const suggestions = [
  { icon: CalendarPlus, text: "ตั้ง Routine วิ่งทุกวันจันทร์และพุธ 07:00 ถึงสิ้นเดือน" },
  { icon: FileSearch, text: "ค้นหาโน้ตเกี่ยวกับ Product Sync" },
  { icon: KeyRound, text: "ขอลิงก์เข้า GitHub จาก Vault" },
];

export default function AIPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat();
  const initialPromptSent = useRef(false);

  async function send(text: string) {
    if (!text.trim() || status === "submitted" || status === "streaming") return;
    setInput("");
    await sendMessage({ text });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

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
        <form className="ai-composer" onSubmit={submit}>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="พิมพ์คำสั่ง เช่น เลื่อน Routine ฟิตเนสของอาทิตย์นี้…" rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }} />
          <button type="submit" disabled={!input.trim() || status === "submitted" || status === "streaming"} aria-label="ส่งข้อความ"><ArrowUp size={19} /></button>
        </form>
        <p><ShieldCheck size={12} /> AI เข้าถึง Vault ได้เฉพาะ metadata และไม่สามารถเปิดรหัสผ่านหรือ OTP</p>
      </div>
    </section>
  </WorkspaceShell>;
}
