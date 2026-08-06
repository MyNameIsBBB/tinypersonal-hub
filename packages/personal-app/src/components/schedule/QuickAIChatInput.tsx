"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function QuickAIChatInput() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    router.push(`/ai?prompt=${encodeURIComponent(message.trim())}`);
  }
  return <div className="ai-panel">
    <div className="ai-label"><Sparkles size={15} /> วางแผนด้วย Gemini</div>
    <form className="ai-input" onSubmit={submit}><input aria-label="คำสั่งจัดตารางด้วย AI" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="เช่น ตั้ง Routine อ่านหนังสือทุก อ. และ พฤ. ถึง 15 ธันวาคม" /><button type="submit" aria-label="เปิด AI Assistant" disabled={!message.trim()}><ArrowUp size={18} /></button></form>
    <p>คำสั่งจะเปิดใน AI Assistant เพื่อให้คุณเห็นผลลัพธ์และยืนยันการทำงาน</p>
  </div>;
}
