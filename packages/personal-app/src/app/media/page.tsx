"use client";

import { FileImage, FileText, HardDrive, Search, ShieldCheck, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

type Asset = { id: string; fileName: string; mimeType: string; fileSize: number; createdAt: string; downloadUrl: string; noteId: string | null; scheduleItemId: string | null };

export default function MediaPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/media", { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { assets: Asset[] }; setAssets(data.assets);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function upload(file: File | undefined) {
    if (!file) return; setUploading(true); setMessage("");
    const form = new FormData(); form.set("file", file);
    const response = await fetch("/api/media", { method: "POST", body: form });
    const data = await response.json() as { error?: string };
    setUploading(false); setMessage(response.ok ? "อัปโหลดและลงทะเบียนไฟล์แล้ว" : data.error ?? "อัปโหลดไม่สำเร็จ");
    if (response.ok) await load();
  }
  const visible = assets.filter((asset) => asset.fileName.toLowerCase().includes(query.toLowerCase()));
  const totalBytes = assets.reduce((sum, asset) => sum + asset.fileSize, 0);
  return <WorkspaceShell active="Media" title="Media & Attachments" subtitle="ไฟล์จริงใน secure storage" action={<button className="add-button" onClick={() => inputRef.current?.click()}><UploadCloud size={17} /><span>{uploading ? "กำลังอัปโหลด…" : "อัปโหลด"}</span></button>}>
    <input ref={inputRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onChange={(event) => void upload(event.target.files?.[0])} />
    <div className="storage-summary"><div><HardDrive size={18} /><span><strong>Secure media storage</strong><small>ไฟล์ถูกตรวจชนิด ขนาด และ checksum ก่อนบันทึก</small></span></div><div className="storage-meter"><span style={{ width: `${Math.min(totalBytes / (100 * 1024 * 1024) * 100, 100)}%` }} /></div><small>{(totalBytes / 1024 / 1024).toFixed(2)} MB</small></div>
    {message && <div className="upload-notice"><ShieldCheck size={17} /> {message}</div>}
    <div className="module-toolbar"><div className="module-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อไฟล์…" /></div></div>
    <section className="media-grid">
      {visible.length ? visible.map((asset) => <a className="media-card" href={asset.downloadUrl} target="_blank" rel="noreferrer" key={asset.id}>
        <div className="media-preview">{asset.mimeType.startsWith("image/") ? <img src={asset.downloadUrl} alt={asset.fileName} /> : <FileText size={34} />}</div>
        <div><strong>{asset.fileName}</strong><span>{asset.noteId ? "Note attachment" : asset.scheduleItemId ? "Schedule attachment" : "Unlinked asset"}</span><small>{(asset.fileSize / 1024 / 1024).toFixed(2)} MB · {new Date(asset.createdAt).toLocaleDateString("th-TH")}</small></div>
      </a>) : <div className="empty-state media-empty"><FileImage size={28} /> ยังไม่มีไฟล์ อัปโหลดรูปภาพหรือ PDF ได้เลย</div>}
    </section>
  </WorkspaceShell>;
}
