import { Bot, CalendarDays, FileImage, KeyRound, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";
import { WorkspaceShell } from "@/components/WorkspaceShell";

export default function Home() {
  return (
    <WorkspaceShell
      active="Schedule"
      title="TinyPersonal App"
      subtitle="ศูนย์กลางงานส่วนตัว พร้อม Notes, Media, Vault และ AI"
    >
      <section className="two-columns">
        <article className="calendar-card">
          <h2 className="section-heading">Today</h2>
          <div className="agenda-view">
            <div className="routine-card">
              <div className="icon-tile"><CalendarDays size={18} /></div>
              <div>
                <strong>Schedule workspace</strong>
                <p>จัดการงาน นัดหมาย และ routine ในมุมมองเดียว</p>
              </div>
            </div>
            <div className="routine-card">
              <div className="icon-tile"><Sparkles size={18} /></div>
              <div>
                <strong>Private by design</strong>
                <p>สิทธิ์การเข้าถึงชัดเจน และข้อมูลสำคัญถูกปกป้อง</p>
              </div>
            </div>
          </div>
        </article>

        <article className="calendar-card">
          <h2 className="section-heading">Quick Access</h2>
          <div className="ai-suggestions">
            <Link href="/notes" className="routine-card"><NotebookPen size={17} /><span>Notes</span></Link>
            <Link href="/media" className="routine-card"><FileImage size={17} /><span>Media</span></Link>
            <Link href="/vault" className="routine-card"><KeyRound size={17} /><span>Vault</span></Link>
            <Link href="/ai" className="routine-card"><Bot size={17} /><span>AI Assistant</span></Link>
          </div>
        </article>
      </section>
    </WorkspaceShell>
  );
}
