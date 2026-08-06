"use client";

import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tinypersonal-")).map((key) => caches.delete(key)))).catch(() => undefined);
      return;
    }
    let refreshing = false;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((registration) => {
      registration.update().catch(() => undefined);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(worker);
        });
      });
    }).catch(() => undefined);
    const controllerChange = () => { if (!refreshing) { refreshing = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => { navigator.serviceWorker.removeEventListener("controllerchange", controllerChange); window.removeEventListener("beforeinstallprompt", beforeInstall); };
  }, []);

  if (dismissed || (!installPrompt && !updateReady)) return null;
  return <div className="pwa-toast" role="status">
    {updateReady ? <><RefreshCw size={17} /><span><strong>มีเวอร์ชันใหม่</strong>อัปเดตแอปเพื่อใช้งานเวอร์ชันล่าสุด</span><button onClick={() => updateReady.postMessage({ type: "SKIP_WAITING" })}>อัปเดต</button></> : <><Download size={17} /><span><strong>ติดตั้ง TinyPersonal</strong>เปิดใช้งานแบบแอปบนมือถือหรือคอมพิวเตอร์</span><button onClick={async () => { await installPrompt?.prompt(); setInstallPrompt(null); }}>ติดตั้ง</button></>}
    <button className="pwa-dismiss" aria-label="ปิด" onClick={() => setDismissed(true)}><X size={15} /></button>
  </div>;
}
