import { DashboardCard } from "@/components/dashboard-card";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <p className="text-sm uppercase tracking-[0.25em] text-cyan-400">Central Orchestrator</p>
      <h1 className="mt-2 text-4xl font-bold">TinyPersonal Hub</h1>
      <p className="mt-3 max-w-2xl text-slate-400">ผู้ช่วยส่วนตัวแบบ modular สำหรับแชต ตารางเวลา และบริการที่เชื่อมต่อ</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <DashboardCard title="Assistant">AI orchestration พร้อม tool scoping</DashboardCard>
        <DashboardCard title="TinySchedule">พื้นที่สำหรับงานและนัดหมาย</DashboardCard>
        <DashboardCard title="Integrations">เชื่อม Calendar, Gmail และ Finance APIs</DashboardCard>
      </div>
    </main>
  );
}
