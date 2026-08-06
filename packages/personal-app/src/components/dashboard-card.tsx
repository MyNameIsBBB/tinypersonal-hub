import type { ReactNode } from "react";

export function DashboardCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-3 font-semibold text-cyan-300">{title}</h2>
      <div className="text-sm text-slate-300">{children}</div>
    </section>
  );
}
