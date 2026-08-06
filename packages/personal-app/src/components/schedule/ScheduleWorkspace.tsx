"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { CalendarView } from "./CalendarView";
import { QuickAIChatInput } from "./QuickAIChatInput";
import { RoutineForm } from "./RoutineForm";
import type { RoutineDraft } from "./RoutineForm";
import type { CalendarItem } from "./CalendarView";

export function ScheduleWorkspace() {
  const [showRoutine, setShowRoutine] = useState(false);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRange = useCallback(async (start = new Date(new Date().getFullYear(), new Date().getMonth(), 1), end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)) => {
    setLoading(true);
    const response = await fetch(`/api/schedule?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { items?: CalendarItem[] };
    setItems(data.items ?? []); setLoading(false);
  }, []);

  useEffect(() => { void loadRange(); }, [loadRange]);

  async function createRoutine(routine: RoutineDraft) {
    const today = new Date();
    const anchorDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const start = new Date(`${anchorDate}T${routine.startTime}:00`);
    let end = new Date(`${anchorDate}T${routine.endTime}:00`);
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    const routineEndDate = new Date(`${routine.endDate}T23:59:59`);
    if (routineEndDate < start) throw new Error("วันสิ้นสุด Routine ต้องไม่อยู่ก่อนวันนี้");
    const response = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: routine.title, type: "ROUTINE", startTime: start.toISOString(), endTime: end.toISOString(),
      recurrenceRule: JSON.stringify({ frequency: routine.frequency, interval: routine.interval, byDays: routine.byDays }),
      routineEndDate: routineEndDate.toISOString(),
    }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
    setShowRoutine(false); await loadRange();
  }

  async function toggleStatus(item: CalendarItem) {
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" }) });
    if (response.ok) setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" } : value));
  }

  return (
    <WorkspaceShell active="Schedule" title="จัดวันของคุณให้ง่ายขึ้น" subtitle="สวัสดี 👋" action={
      <button className="add-button" onClick={() => setShowRoutine((value) => !value)}><Plus size={18} /><span>เพิ่ม Routine</span></button>
    }>
        <QuickAIChatInput />
        <div className={`workspace-grid ${showRoutine ? "show-form" : ""}`}>
          <CalendarView items={items} loading={loading} onStatusChange={toggleStatus} onRangeChange={loadRange} />
          <div className="routine-column"><RoutineForm onCreate={createRoutine} /></div>
        </div>
    </WorkspaceShell>
  );
}
