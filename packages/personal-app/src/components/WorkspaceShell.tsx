"use client";

import { Bot, CalendarDays, FileImage, KeyRound, LogOut, Menu, NotebookPen, Sparkles, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState, type ReactNode } from "react";

const modules = [
  { href: "/", label: "Schedule", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/media", label: "Media", icon: FileImage },
  { href: "/vault", label: "Vault", icon: KeyRound },
  { href: "/ai", label: "AI Assistant", icon: Bot },
] as const;

export function WorkspaceShell({ active, title, subtitle, action, children }: {
  active: typeof modules[number]["label"];
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand-row">
          <Image className="brand-logo" src="/tinypersonal-logo-192.png" alt="TinyPersonal tiger logo" width={42} height={42} priority />
          <div><strong>TinyPersonal</strong><span>Personal workspace</span></div>
          <button className="mobile-close" aria-label="ปิดเมนู" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav aria-label="แอปทั้งหมด">
          <p>Apps</p>
          {modules.map(({ href, label, icon: Icon }) => (
            <Link className={active === label ? "active" : ""} href={href} key={href} onClick={() => setOpen(false)}>
              <Icon size={18} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note"><span><Sparkles size={15} /> Private by design</span><p>ข้อมูลสำคัญอยู่หลังขอบเขตสิทธิ์และการเข้ารหัส</p></div>
        <div className="profile-row"><div className="avatar">P</div><div><strong>Personal space</strong><span>Asia/Bangkok</span></div><button aria-label="ออกจากระบบ" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); window.location.assign("/login"); }}><LogOut size={16} /></button></div>
      </aside>
      {open && <button className="nav-scrim" aria-label="ปิดเมนู" onClick={() => setOpen(false)} />}
      <main className="workspace-main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="เปิดเมนู" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <div><p>{subtitle}</p><h1>{title}</h1></div>{action}
        </header>
        {children}
      </main>
    </div>
  );
}
