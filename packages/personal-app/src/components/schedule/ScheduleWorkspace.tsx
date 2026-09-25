"use client";

import { CalendarPlus, Pencil, Plus, Repeat2, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { CalendarView } from "./CalendarView";
import { QuickAIChatInput } from "./QuickAIChatInput";
import { RoutineForm } from "./RoutineForm";
import type { RoutineDraft } from "./RoutineForm";
import type { CalendarItem } from "./CalendarView";
import { AppModal } from "../AppModal";

const BANGKOK_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET_HOURS = 7;
const routineFrequencyLabels = { DAILY: "ทุกวัน", WEEKLY: "ทุกสัปดาห์", MONTHLY: "ทุกเดือน", YEARLY: "ทุกปี" } as const;
const weekdayLabels: Record<string, string> = { MO: "จ.", TU: "อ.", WE: "พ.", TH: "พฤ.", FR: "ศ.", SA: "ส.", SU: "อา." };
const statusLabels: Record<CalendarItem["status"], string> = { PENDING: "รอดำเนินการ", IN_PROGRESS: "กำลังทำ", COMPLETED: "เสร็จแล้ว", CANCELLED: "ยกเลิกแล้ว" };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toBangkokWallClock(date: Date): Date {
  return new Date(date.getTime() + BANGKOK_OFFSET_HOURS * 60 * 60 * 1000);
}

function bangkokDateKey(date: Date): string {
  const local = toBangkokWallClock(date);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}

function bangkokTimeHHMM(date: Date): string {
  const local = toBangkokWallClock(date);
  return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}

function bangkokLocalToUtc(dateKey: string, time: string, second = 0): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - BANGKOK_OFFSET_HOURS, minute, second, 0));
}

function bangkokDisplayDateFromKey(dateKey: string): string {
  return bangkokLocalToUtc(dateKey, "00:00").toLocaleDateString("th-TH", {
    timeZone: BANGKOK_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function readRoutineRule(value?: string | null): { frequency: RoutineDraft["frequency"]; interval: number; byDays: string[] } {
  if (!value) return { frequency: "WEEKLY", interval: 1, byDays: [] };
  try {
    if (value.trim().startsWith("{")) {
      const parsed = JSON.parse(value) as { frequency?: RoutineDraft["frequency"]; interval?: number; byDays?: string[] };
      return { frequency: parsed.frequency ?? "WEEKLY", interval: parsed.interval ?? 1, byDays: parsed.byDays ?? [] };
    }
    const fields = Object.fromEntries(value.replace(/^RRULE:/, "").split(";").map((part) => part.split("=", 2)));
    return { frequency: (fields.FREQ as RoutineDraft["frequency"]) ?? "WEEKLY", interval: Number(fields.INTERVAL ?? 1), byDays: fields.BYDAY?.split(",") ?? [] };
  } catch {
    return { frequency: "WEEKLY", interval: 1, byDays: [] };
  }
}

export function ScheduleWorkspace() {
  const loadedMonth = useRef(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"day" | "event" | "routine">("day");
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [routines, setRoutines] = useState<CalendarItem[]>([]);
  const [editingRoutine, setEditingRoutine] = useState<CalendarItem | null>(null);
  const [selectedDate, setSelectedDate] = useState(bangkokDateKey(new Date()));
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ item: CalendarItem; kind: "item" | "routine" } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    type: "EVENT" as "EVENT" | "TASK",
    date: bangkokDateKey(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    isAllDay: false,
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  });

  const loadRange = useCallback(async (requestedStart?: Date) => {
    const start = requestedStart ?? loadedMonth.current;
    loadedMonth.current = start;
    const localStart = toBangkokWallClock(start);
    const year = localStart.getUTCFullYear();
    const month = localStart.getUTCMonth();
    const monthStartUtc = new Date(Date.UTC(year, month, 1, -BANGKOK_OFFSET_HOURS, 0, 0, 0));
    const monthEndUtc = new Date(Date.UTC(year, month + 1, 0, 23 - BANGKOK_OFFSET_HOURS, 59, 59, 999));
    setLoading(true);
    const response = await fetch(`/api/schedule?start=${encodeURIComponent(monthStartUtc.toISOString())}&end=${encodeURIComponent(monthEndUtc.toISOString())}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { items?: CalendarItem[]; routines?: CalendarItem[] };
    setItems(data.items ?? []); setRoutines(data.routines ?? []); setLoading(false);
  }, []);

  useEffect(() => { void loadRange(); }, [loadRange]);

  // Replace a potentially stale prerendered date as soon as the client mounts.
  useEffect(() => {
    const today = bangkokDateKey(new Date());
    setSelectedDate(today);
    setDraft((current) => ({ ...current, date: today }));
  }, []);

  function openDayModal(dateKey: string) {
    setSelectedDate(dateKey);
    setModalMode("day");
    setModalOpen(true);
  }

  function openCreateEditor() {
    setEditingItem(null);
    setDraft({
      title: "",
      description: "",
      type: "EVENT",
      date: selectedDate,
      startTime: "09:00",
      endTime: "10:00",
      isAllDay: false,
      priority: "MEDIUM",
    });
    setModalMode("event");
    setModalOpen(true);
    setMessage("");
  }

  function openEditEditor(item: CalendarItem) {
    if (item.parentRoutineId) {
      const parent = routines.find((routine) => routine.id === item.parentRoutineId) ?? null;
      if (!parent) {
        setMessage("Routine นี้สิ้นสุดแล้ว จึงไม่มีรายการที่กำลังใช้งานให้แก้ไข");
        return;
      }
      setEditingRoutine(parent);
      setModalMode("routine");
      setModalOpen(true);
      return;
    }
    if (!item.startTime) return;
    const start = new Date(item.startTime);
    const end = item.endTime ? new Date(item.endTime) : null;
    setEditingItem(item);
    setDraft({
      title: item.title,
      description: item.description ?? "",
      type: item.type === "TASK" ? "TASK" : "EVENT",
      date: bangkokDateKey(start),
      startTime: item.isAllDay ? "00:00" : bangkokTimeHHMM(start),
      endTime: end ? bangkokTimeHHMM(end) : "10:00",
      isAllDay: Boolean(item.isAllDay),
      priority: item.priority ?? "MEDIUM",
    });
    setModalMode("event");
    setModalOpen(true);
    setMessage("");
  }

  async function saveItem() {
    if (!draft.title.trim()) {
      setMessage("กรุณาใส่ชื่อรายการ");
      return;
    }

    const startTime = draft.isAllDay
      ? bangkokLocalToUtc(draft.date, "00:00")
      : bangkokLocalToUtc(draft.date, draft.startTime);
    const endTime = draft.isAllDay
      ? bangkokLocalToUtc(draft.date, "23:59")
      : bangkokLocalToUtc(draft.date, draft.endTime);

    if (draft.type === "EVENT" && endTime <= startTime) {
      setMessage("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
      return;
    }

    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      type: draft.type,
      startTime: startTime.toISOString(),
      endTime: draft.type === "TASK" ? null : endTime.toISOString(),
      isAllDay: draft.isAllDay,
      priority: draft.priority,
    };

    setSaving(true);
    const response = await fetch(editingItem ? `/api/schedule/${encodeURIComponent(editingItem.id)}` : "/api/schedule", {
      method: editingItem ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    setSaving(false);

    if (!response.ok) {
      setMessage(data.error ?? "บันทึกไม่สำเร็จ");
      return;
    }

    setModalMode("day");
    setMessage(editingItem ? "แก้ไข Event แล้ว" : "สร้าง Event แล้ว");
    await loadRange();
  }

  async function deleteItem(item: CalendarItem) {
    if (item.parentRoutineId) {
      setMessage("รายการจาก Routine แก้ไข/ลบได้จากตัว Routine เท่านั้น");
      return;
    }
    setDeleting(true);
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "DELETE" }),
    });
    if (!response.ok) {
      setMessage("ลบไม่สำเร็จ");
      setDeleting(false); setDeleteTarget(null); return;
    }
    setDeleting(false); setDeleteTarget(null); setMessage("ลบ Event แล้ว");
    await loadRange();
  }

  async function saveRoutine(routine: RoutineDraft) {
    const anchorDate = editingRoutine?.startTime ? bangkokDateKey(new Date(editingRoutine.startTime)) : bangkokDateKey(new Date());
    const start = bangkokLocalToUtc(anchorDate, routine.startTime);
    let end = bangkokLocalToUtc(anchorDate, routine.endTime);
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    const routineEndDate = bangkokLocalToUtc(routine.endDate, "23:59", 59);
    if (routineEndDate < start) throw new Error("วันสิ้นสุด Routine ต้องไม่อยู่ก่อนวันนี้");
    const response = await fetch(editingRoutine ? `/api/schedule/${encodeURIComponent(editingRoutine.id)}` : "/api/schedule", { method: editingRoutine ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: routine.title, type: "ROUTINE", startTime: start.toISOString(), endTime: end.toISOString(),
      recurrenceRule: JSON.stringify({ frequency: routine.frequency, interval: routine.interval, byDays: routine.byDays }),
      routineEndDate: routineEndDate.toISOString(),
    }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
    setMessage("สร้าง Routine แล้ว");
    setMessage(editingRoutine ? "แก้ไข Routine แล้ว" : "สร้าง Routine แล้ว");
    setEditingRoutine(null);
    await loadRange();
  }

  function routineDraft(item: CalendarItem): RoutineDraft {
    const rule = readRoutineRule(item.recurrenceRule);
    const start = item.startTime ? new Date(item.startTime) : new Date();
    const end = item.endTime ? new Date(item.endTime) : new Date(start.getTime() + 3_600_000);
    return {
      title: item.title, frequency: rule.frequency, interval: rule.interval,
      byDays: rule.byDays, startTime: bangkokTimeHHMM(start), endTime: bangkokTimeHHMM(end),
      endDate: item.routineEndDate ? bangkokDateKey(new Date(item.routineEndDate)) : bangkokDateKey(new Date()),
    };
  }

  async function deleteRoutine(item: CalendarItem) {
    setDeleting(true);
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "CANCEL", scope: "ALL" }),
    });
    if (!response.ok) { setDeleting(false); setDeleteTarget(null); setMessage("ลบ Routine ไม่สำเร็จ"); return; }
    setDeleting(false); setDeleteTarget(null); setEditingRoutine(null); setMessage("ลบ Routine แล้ว"); await loadRange();
  }

  async function toggleStatus(item: CalendarItem) {
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" }) });
    if (response.ok) setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" } : value));
  }

  const dayItems = items.filter((item) => {
    if (!item.startTime) return false;
    return bangkokDateKey(new Date(item.startTime)) === selectedDate;
  }).sort((left, right) => {
    if (!left.startTime) return 1;
    if (!right.startTime) return -1;
    return new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
  });

  function closeModal() {
    setModalOpen(false);
    setEditingItem(null);
    setEditingRoutine(null);
  }

  function openRoutineManager() {
    setModalMode("routine");
    setModalOpen(true);
    setEditingRoutine(null);
  }

  return (
    <WorkspaceShell active="Schedule" title="ตารางเวลา" subtitle="Event และ Routine แยกกัน จัดการได้ตรงจุด" action={<div className="schedule-actions"><button className="primary-button schedule-create-button" onClick={openCreateEditor}><CalendarPlus size={16} /> เพิ่ม Event</button><button className="today-button schedule-routine-button" onClick={openRoutineManager}><Repeat2 size={16} /> Routine ({routines.length})</button></div>}>
        <QuickAIChatInput />
        {message && <div className="upload-notice">{message}</div>}
        <div className="workspace-grid schedule-only">
          <CalendarView
            items={items}
            loading={loading}
            onStatusChange={toggleStatus}
            onRangeChange={loadRange}
            onDateSelect={openDayModal}
            onItemSelect={(item) => {
              const dateKey = item.startTime ? bangkokDateKey(new Date(item.startTime)) : selectedDate;
              setSelectedDate(dateKey);
              setModalMode("day");
              setModalOpen(true);
            }}
            selectedDateKey={selectedDate}
          />
        </div>

        {modalOpen && (
          <div className="schedule-modal-backdrop" onClick={closeModal}>
            <section className="schedule-modal" onClick={(event) => event.stopPropagation()}>
              <header className="schedule-modal-head">
                <div>
                  <p className="eyebrow">{modalMode === "routine" ? "Routine" : modalMode === "event" ? (editingItem ? "Edit event" : "New event") : "Day schedule"}</p>
                  <h2>{modalMode === "routine" ? "จัดการ Routine" : modalMode === "event" ? (editingItem ? "แก้ไข Event" : "สร้าง Event ใหม่") : bangkokDisplayDateFromKey(selectedDate)}</h2>
                </div>
                <button className="today-button" aria-label="ปิด" onClick={closeModal}><X size={16} /></button>
              </header>

              {modalMode === "routine" ? (
                <div className="modal-routine-wrap">
                  <div className="routine-manager-list">
                    <div className="section-heading"><div><p className="eyebrow">Active routines</p><h3>รายการที่ทำซ้ำ ({routines.length})</h3></div><button className="today-button" onClick={() => setEditingRoutine(null)}><Plus size={14} /> สร้างใหม่</button></div>
                    {routines.length === 0 ? <div className="modal-empty-state">ยังไม่มี Routine ที่กำลังใช้งาน</div> : routines.map((routine) => (
                      <article className={`day-item-row ${editingRoutine?.id === routine.id ? "selected" : ""}`} key={routine.id}>
                        <div>
                          <strong>{routine.title}</strong>
                          {(() => { const rule = readRoutineRule(routine.recurrenceRule); return <p>{routineFrequencyLabels[rule.frequency]}{rule.frequency === "WEEKLY" && rule.byDays.length ? ` · ${rule.byDays.map((day) => weekdayLabels[day] ?? day).join(" ")}` : ""}</p>; })()}
                          <small>สิ้นสุด {routine.routineEndDate ? new Date(routine.routineEndDate).toLocaleDateString("th-TH", { timeZone: BANGKOK_TZ }) : "ไม่ระบุ"}</small>
                        </div>
                        <div className="day-item-actions">
                          <button className="today-button" aria-label="แก้ไข Routine" onClick={() => setEditingRoutine(routine)}><Pencil size={14} /></button>
                          <button className="danger-button" aria-label="ลบ Routine" onClick={() => setDeleteTarget({ item: routine, kind: "routine" })}><Trash2 size={14} /></button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <RoutineForm key={editingRoutine?.id ?? "new"} initial={editingRoutine ? routineDraft(editingRoutine) : undefined} onCreate={saveRoutine} />
                </div>
              ) : modalMode === "event" ? (
                <div className="item-editor event-editor">
                  <div className="item-editor-grid">
                    <label className="event-title-field"><span>ชื่อ Event</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น สอบ Final ADT" /></label>
                    <label><span>วันที่</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
                    <label><span>เวลาเริ่ม</span><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} disabled={draft.isAllDay} /></label>
                    <label><span>เวลาสิ้นสุด</span><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} disabled={draft.isAllDay} /></label>
                  </div>
                  <label className="item-editor-check"><input type="checkbox" checked={draft.isAllDay} onChange={(event) => setDraft({ ...draft, isAllDay: event.target.checked })} /> Event เต็มวัน</label>
                  <label><span>รายละเอียด (ไม่บังคับ)</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="สถานที่ ลิงก์ หรือรายละเอียดเพิ่มเติม" /></label>
                  {message && <small className="form-error">{message}</small>}
                  <div className="item-editor-actions"><button className="today-button" onClick={() => setModalMode("day")}>กลับ</button><button className="primary-button" onClick={() => void saveItem()} disabled={saving}><Save size={15} /> {saving ? "กำลังบันทึก..." : (editingItem ? "บันทึกการแก้ไข" : "สร้าง Event")}</button></div>
                </div>
              ) : (
                <>
                  <div className="schedule-modal-actions">
                    <button className="add-button" onClick={openCreateEditor}><CalendarPlus size={16} /><span>เพิ่ม Event วันนี้</span></button>
                  </div>

                  <div className="day-item-list">
                    {dayItems.length === 0 ? <div className="modal-empty-state">ยังไม่มีรายการในวันนี้</div> : dayItems.map((item) => {
                      const start = item.startTime ? new Date(item.startTime) : null;
                      const end = item.endTime ? new Date(item.endTime) : null;
                      return <article key={item.id} className="day-item-row">
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.parentRoutineId ? "Routine" : "Event"} · {statusLabels[item.status]}</p>
                          <small>{item.isAllDay ? "เต็มวัน" : <>{start ? start.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" }) : "ไม่ระบุเวลา"}{end ? ` - ${end.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" })}` : ""}</>}</small>
                        </div>
                        <div className="day-item-actions">{item.parentRoutineId ? <button className="today-button routine-instance-action" onClick={() => openEditEditor(item)}><Repeat2 size={14} /> จัดการ Routine</button> : <><button className="today-button" aria-label={`แก้ไข ${item.title}`} onClick={() => openEditEditor(item)}><Pencil size={14} /></button><button className="danger-button" aria-label={`ลบ ${item.title}`} onClick={() => setDeleteTarget({ item, kind: "item" })}><Trash2 size={14} /></button></>}</div>
                      </article>;
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
        <AppModal open={Boolean(deleteTarget)} title={deleteTarget?.kind === "routine" ? "ลบ Routine นี้?" : "ลบรายการนี้?"} description={deleteTarget?.kind === "routine" ? `“${deleteTarget.item.title}” และรายการในอนาคตทั้งหมดจะถูกลบ` : `“${deleteTarget?.item.title ?? "รายการ"}” จะถูกลบถาวร`} tone="danger" confirmLabel="ลบ" cancelLabel="ยกเลิก" busy={deleting} onConfirm={() => { if (deleteTarget?.kind === "routine") void deleteRoutine(deleteTarget.item); else if (deleteTarget) void deleteItem(deleteTarget.item); }} onClose={() => { if (!deleting) setDeleteTarget(null); }} />
    </WorkspaceShell>
  );
}
