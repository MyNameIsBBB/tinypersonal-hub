"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function AppModal({ open, title, description, tone = "info", confirmLabel = "ตกลง", cancelLabel, busy = false, children, onConfirm, onClose }: {
  open: boolean;
  title: string;
  description?: string;
  tone?: "info" | "danger" | "success";
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  children?: ReactNode;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, open]);

  if (!open) return null;
  const Icon = tone === "danger" ? AlertTriangle : tone === "success" ? CheckCircle2 : Info;
  return <div className="app-modal-backdrop" role="presentation" onMouseDown={() => { if (!busy) onClose(); }}>
    <section className={`app-modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby="app-modal-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="app-modal-close" aria-label="ปิด" disabled={busy} onClick={onClose}><X size={18} /></button>
      <Icon className="app-modal-icon" size={27} />
      <h2 id="app-modal-title">{title}</h2>
      {description && <p>{description}</p>}
      {children}
      <footer>
        {cancelLabel && <button disabled={busy} onClick={onClose}>{cancelLabel}</button>}
        <button className={tone === "danger" ? "danger-confirm-button" : "primary-button"} disabled={busy} onClick={onConfirm ?? onClose}>{busy ? "กำลังดำเนินการ…" : confirmLabel}</button>
      </footer>
    </section>
  </div>;
}
