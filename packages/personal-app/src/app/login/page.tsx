"use client";

import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    if (response.ok) { const returnTo = new URLSearchParams(window.location.search).get("returnTo"); window.location.assign(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/"); }
    else { setError("Username หรือ Password ไม่ถูกต้อง"); setLoading(false); }
  }
  return <main className="login-page"><section className="login-card">
    <Image src="/tinypersonal-logo.png" width={76} height={76} alt="TinyPersonal" priority />
    <p className="eyebrow">Private workspace</p><h1>TinyPersonal Hub</h1><p>เข้าสู่พื้นที่ส่วนตัวเพื่อเปิด Schedule, Notes, Media, Vault และ AI</p>
    <form onSubmit={submit}><label><span>Username</span><input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></label><label><span><LockKeyhole size={14} /> Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><small>Session จะคงอยู่ 30 วันบนอุปกรณ์นี้</small><button className="primary-button" disabled={loading}>{loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button></form>
    {error && <div className="chat-error">{error}</div>}
  </section></main>;
}
