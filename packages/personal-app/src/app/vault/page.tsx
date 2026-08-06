"use client";

import { Copy, Eye, EyeOff, KeyRound, LockKeyhole, Plus, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

type Secret = { id: string; serviceName: string; category: string; accountIdentifier: string; url: string | null; createdAt: string; updatedAt: string };

export default function VaultPage() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const load = useCallback(async (search = "") => {
    const response = await fetch(`/api/vault?q=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { secrets: Secret[] }; setSecrets(data.secrets);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setMessage(data.error ?? "บันทึกไม่สำเร็จ"); return; }
    setShowForm(false); setMessage("เข้ารหัสและบันทึก Secret แล้ว"); await load(query);
  }
  async function reveal() {
    if (!revealId) return;
    const response = await fetch(`/api/vault/${revealId}/reveal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: stepUp, reason: "User requested reveal in Vault UI" }) });
    const data = await response.json() as { password?: string; error?: string };
    if (!response.ok || !data.password) { setMessage(data.error ?? "ยืนยันตัวตนไม่สำเร็จ"); return; }
    setRevealed((current) => ({ ...current, [revealId]: data.password! })); setRevealId(null); setStepUp("");
    window.setTimeout(() => setRevealed((current) => { const next = { ...current }; delete next[revealId]; return next; }), 30_000);
  }
  return <WorkspaceShell active="Vault" title="Secrets Vault" subtitle="ข้อมูลเข้ารหัส AES‑256‑GCM" action={<button className="add-button" onClick={() => setShowForm((value) => !value)}><Plus size={17} /><span>เพิ่ม Secret</span></button>}>
    <div className="vault-banner"><div className="vault-shield"><ShieldCheck size={24} /></div><div><strong>Zero-trust protection is active</strong><p>AES‑256‑GCM · Master key isolated · AI metadata-only</p></div><span><LockKeyhole size={14} /> Step-up protected</span></div>
    {showForm && <form className="vault-form" onSubmit={create}><input name="serviceName" placeholder="Service name" required /><input name="accountIdentifier" placeholder="Username / Email" required /><input name="password" type="password" placeholder="Password" autoComplete="new-password" required /><input name="category" placeholder="Category" required /><input name="url" type="url" placeholder="https://…" /><input name="totpSeed" type="password" placeholder="TOTP seed (optional)" /><button className="primary-button">เข้ารหัสและบันทึก</button></form>}
    {message && <div className="upload-notice"><ShieldCheck size={17} /> {message}</div>}
    <form className="module-toolbar" onSubmit={(event) => { event.preventDefault(); void load(query); }}><div className="module-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา service, account หรือ category…" /></div></form>
    <section className="vault-list">
      {secrets.length ? secrets.map((secret) => <article className="vault-row" key={secret.id}>
        <div className="service-icon"><KeyRound size={19} /></div><div className="vault-info"><strong>{secret.serviceName}</strong><span>{secret.accountIdentifier}{secret.url && <> · <a href={secret.url} target="_blank" rel="noreferrer">{new URL(secret.url).hostname}</a></>}</span><small>{secret.category}</small></div>
        <div className="password-mask"><code>{revealed[secret.id] ?? "••••••••••••••"}</code><button aria-label="แสดงรหัสผ่าน" onClick={() => revealed[secret.id] ? setRevealed((current) => { const next = { ...current }; delete next[secret.id]; return next; }) : setRevealId(secret.id)}>{revealed[secret.id] ? <EyeOff size={17} /> : <Eye size={17} />}</button><button aria-label="คัดลอก" disabled={!revealed[secret.id]} onClick={() => void navigator.clipboard.writeText(revealed[secret.id] ?? "")}><Copy size={17} /></button></div>
      </article>) : <div className="empty-state">Vault ยังว่าง เพิ่ม Secret แรกเพื่อเริ่มใช้งาน</div>}
    </section>
    {revealId && <div className="modal-backdrop"><div className="stepup-modal"><LockKeyhole size={25} /><h2>ยืนยันตัวตนอีกครั้ง</h2><p>ใส่ Vault reveal password เพื่อเปิดรหัสผ่าน 30 วินาที</p><input type="password" value={stepUp} onChange={(event) => setStepUp(event.target.value)} autoFocus /><div><button onClick={() => setRevealId(null)}>ยกเลิก</button><button className="primary-button" onClick={() => void reveal()}>ยืนยัน</button></div></div></div>}
    <p className="vault-footnote">Plaintext ไม่ถูกส่งให้ AI, ไม่ถูกบันทึกใน log และไม่ถูก cache</p>
  </WorkspaceShell>;
}
