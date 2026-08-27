"use client";

import { Bell, BellOff, Bot, CalendarDays, FileImage, KeyRound, LogOut, Menu, NotebookPen, PanelLeftClose, PanelLeftOpen, RadioTower, Sparkles, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { AppModal } from "./AppModal";

const modules = [
  { href: "/ai", label: "AI Assistant", icon: Bot },
  { href: "/jarvis", label: "Jarvis Mode", icon: RadioTower },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/notes", label: "Notes", icon: NotebookPen },
  { href: "/media", label: "Media", icon: FileImage },
  { href: "/vault", label: "Vault", icon: KeyRound },
] as const;

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds)),
  ]);
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("เบราว์เซอร์นี้ไม่รองรับ Service Worker");
  await withTimeout(navigator.serviceWorker.register("/sw.js", { scope: "/" }), 10_000, "ติดตั้ง Service Worker ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่");
  return withTimeout(navigator.serviceWorker.ready, 10_000, "Service Worker ยังไม่พร้อม กรุณาปิดแล้วเปิดแอปใหม่");
}

export function WorkspaceShell({ active, title, subtitle, action, focusMode = false, immersive = false, children }: {
  active: typeof modules[number]["label"];
  title: string;
  subtitle: string;
  action?: ReactNode;
  focusMode?: boolean;
  immersive?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(focusMode);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationConfigured, setNotificationConfigured] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("Notification" in globalThis)) return;
    void fetch("/api/notifications/push", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data: { subscribed?: boolean; configured?: boolean } | null) => {
      setNotificationEnabled(Boolean(data?.subscribed) && Notification.permission === "granted");
      setNotificationConfigured(data?.configured !== false);
    });
  }, []);

  async function toggleNotifications() {
    setNotificationBusy(true); setNotificationMessage("");
    try {
      if (!("Notification" in globalThis) || !("PushManager" in globalThis)) throw new Error("เบราว์เซอร์หรือระบบเวอร์ชันนี้ยังไม่รองรับ Web Push");
      const iosNavigator = navigator as Navigator & { standalone?: boolean };
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIos && !iosNavigator.standalone) throw new Error("บน iPhone/iPad กรุณา Add to Home Screen แล้วเปิด TinyPersonal จากไอคอนบนหน้าจอหลัก");
      const registration = await readyServiceWorker();
      const existing = await registration.pushManager.getSubscription();
      if (notificationEnabled) {
        if (existing) await fetch("/api/notifications/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        await existing?.unsubscribe(); setNotificationEnabled(false); setNotificationOpen(false); return;
      }
      const configResponse = await fetch("/api/notifications/push", { cache: "no-store" });
      const config = await configResponse.json() as { configured?: boolean; publicKey?: string | null; error?: string };
      if (!configResponse.ok || !config.configured || !config.publicKey) throw new Error(config.error ?? "ผู้ดูแลระบบยังไม่ได้ตั้งค่า Web Push");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("ไม่ได้รับอนุญาตให้ส่งการแจ้งเตือน กรุณาเปิดสิทธิ์ในการตั้งค่าระบบ");
      const padding = "=".repeat((4 - config.publicKey.length % 4) % 4);
      const bytes = Uint8Array.from(atob((config.publicKey + padding).replace(/-/g, "+").replace(/_/g, "/")), (value) => value.charCodeAt(0));
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      const json = subscription.toJSON();
      const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint, keys: json.keys }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? `บันทึกอุปกรณ์สำหรับแจ้งเตือนไม่สำเร็จ (HTTP ${response.status})`);
      }
      setNotificationEnabled(true); setNotificationOpen(false);
    } catch (error) { setNotificationMessage(error instanceof Error ? error.message : "ตั้งค่าการแจ้งเตือนไม่สำเร็จ"); }
    finally { setNotificationBusy(false); }
  }
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""} ${immersive ? "immersive" : ""}`}>
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
        <button className="notification-toggle" onClick={() => setNotificationOpen(true)}>{notificationEnabled ? <Bell size={16} /> : <BellOff size={16} />}<span>{notificationEnabled ? "เปิดการแจ้งเตือนแล้ว" : "ตั้งค่าการแจ้งเตือน"}</span></button>
        <div className="sidebar-version" title="เวอร์ชันของ build ที่กำลังเปิดอยู่">Build {appVersion}</div>
        <div className="sidebar-note"><span><Sparkles size={15} /> Private by design</span><p>ข้อมูลสำคัญอยู่หลังขอบเขตสิทธิ์และการเข้ารหัส</p></div>
        <div className="profile-row"><div className="avatar">P</div><div><strong>Personal space</strong><span>Asia/Bangkok</span></div><button aria-label="ออกจากระบบ" onClick={async () => { await fetch("/api/auth/session", { method: "DELETE" }); window.location.assign("/login"); }}><LogOut size={16} /></button></div>
      </aside>
      {open && <button className="nav-scrim" aria-label="ปิดเมนู" onClick={() => setOpen(false)} />}
      <main className="workspace-main">
        <header className="topbar">
          <button className="mobile-menu" aria-label="เปิดเมนู" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <button className="desktop-sidebar-toggle" aria-label={collapsed ? "เปิด sidebar" : "ปิด sidebar"} title={collapsed ? "เปิด sidebar" : "ปิด sidebar"} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <div><p>{subtitle}</p><h1>{title}</h1></div>{action}
        </header>
        {children}
      </main>
      <AppModal open={notificationOpen} title={notificationEnabled ? "ปิดการแจ้งเตือน?" : "แจ้งเตือนบนอุปกรณ์นี้"} description={notificationEnabled ? "อุปกรณ์นี้จะไม่ได้รับสรุปเช้าจาก TinyPersonal อีก" : "รับสรุปเช้าบน macOS หรือ iOS โดย iPhone/iPad ต้องติดตั้งเว็บนี้ผ่าน Add to Home Screen ก่อน"} tone={notificationEnabled ? "danger" : "info"} confirmLabel={notificationEnabled ? "ปิดการแจ้งเตือน" : "เปิดการแจ้งเตือน"} cancelLabel="ไว้ภายหลัง" busy={notificationBusy} onConfirm={() => void toggleNotifications()} onClose={() => { if (!notificationBusy) { setNotificationOpen(false); setNotificationMessage(""); } }}>
        {!notificationConfigured && <p className="app-modal-error">ผู้ดูแลระบบยังไม่ได้ตั้งค่า Web Push</p>}
        {notificationMessage && <p className="app-modal-error">{notificationMessage}</p>}
      </AppModal>
    </div>
  );
}
