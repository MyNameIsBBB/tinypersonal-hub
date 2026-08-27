"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { CalendarView } from "./CalendarView";
import { QuickAIChatInput } from "./QuickAIChatInput";
import { RoutineForm } from "./RoutineForm";
import type { RoutineDraft } from "./RoutineForm";
import type { CalendarItem } from "./CalendarView";
import { AppModal } from "../AppModal";

const BANGKOK_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET_HOURS = 7;

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
  if (value.trim().startsWith("{")) {
    const parsed = JSON.parse(value) as { frequency?: RoutineDraft["frequency"]; interval?: number; byDays?: string[] };
    return { frequency: parsed.frequency ?? "WEEKLY", interval: parsed.interval ?? 1, byDays: parsed.byDays ?? [] };
  }
  const fields = Object.fromEntries(value.replace(/^RRULE:/, "").split(";").map((part) => part.split("=", 2)));
  return { frequency: (fields.FREQ as RoutineDraft["frequency"]) ?? "WEEKLY", interval: Number(fields.INTERVAL ?? 1), byDays: fields.BYDAY?.split(",") ?? [] };
}

export function ScheduleWorkspace() {
  const [manageOpen, setManageOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"day" | "routine">("day");
  const [showEditor, setShowEditor] = useState(false);
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

  const loadRange = useCallback(async (start = new Date()) => {
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
    setShowEditor(true);
    setMessage("");
  }

  function openEditEditor(item: CalendarItem) {
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
    setShowEditor(true);
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

    setShowEditor(false);
    setMessage(editingItem ? "แก้ไขแล้ว" : "สร้างรายการแล้ว");
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
    setDeleting(false); setDeleteTarget(null); setMessage("ลบแล้ว");
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
    setShowEditor(false);
    setEditingItem(null);
    setEditingRoutine(null);
  }

  function openRoutineManager() {
    setManageOpen(true);
    setModalMode("routine");
    setModalOpen(true);
    setShowEditor(false);
  }

  return (
    <WorkspaceShell active="Schedule" title="จัดวันของคุณให้ง่ายขึ้น" subtitle="สวัสดี 👋" action={<div className="schedule-actions"><button className="today-button manage-toggle" onClick={() => {
      setManageOpen((value) => {
        const next = !value;
        if (next) {
          setModalOpen(true);
          setModalMode("day");
        } else {
          setShowEditor(false);
          setModalMode("day");
        }
        return next;
      });
    }}>{manageOpen ? "ปิดโหมดจัดการ" : "จัดการ"}</button><button className="primary-button" onClick={openRoutineManager}>Routine ({routines.length})</button></div>}>
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
              if (manageOpen) {
                openEditEditor(item);
              } else {
                setShowEditor(false);
              }
            }}
            selectedDateKey={selectedDate}
          />
        </div>

        {modalOpen && (
          <div className="schedule-modal-backdrop" onClick={closeModal}>
            <section className="schedule-modal" onClick={(event) => event.stopPropagation()}>
              <header className="schedule-modal-head">
                <div>
                  <p className="eyebrow">{manageOpen ? "Manage schedule" : "Day details"}</p>
                  <h2>{bangkokDisplayDateFromKey(selectedDate)}</h2>
                </div>
                <button className="today-button" aria-label="ปิด" onClick={closeModal}><X size={16} /></button>
              </header>

              {manageOpen && (
                <div className="modal-switcher">
                  <button className={modalMode === "day" ? "active" : ""} onClick={() => setModalMode("day")}>รายการประจำวัน</button>
                  <button className={modalMode === "routine" ? "active" : ""} onClick={() => setModalMode("routine")}>Routine Builder</button>
                </div>
              )}

              {modalMode === "routine" ? (
                <div className="modal-routine-wrap">
                  <div className="routine-manager-list">
                    <div className="section-heading"><div><p className="eyebrow">Active routines</p><h2>Routine ที่กำลังใช้งาน ({routines.length})</h2></div></div>
                    {routines.length === 0 ? <div className="modal-empty-state">ยังไม่มี Routine ที่กำลังใช้งาน</div> : routines.map((routine) => (
                      <article className="day-item-row" key={routine.id}>
                        <div>
                          <strong>{routine.title}</strong>
                          <p>{readRoutineRule(routine.recurrenceRule).frequency}</p>
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
              ) : (
                <>
                  {manageOpen && (
                    <div className="schedule-modal-actions">
                      <button className="add-button" onClick={openCreateEditor}><Plus size={16} /><span>เพิ่มรายการ</span></button>
                      <button className="today-button" onClick={() => setModalMode("routine")}>ไปที่ Routine Builder</button>
                    </div>
                  )}

                  {showEditor && (
                    <div className="item-editor">
                      <div className="item-editor-grid">
                        <label><span>ชื่อรายการ</span><input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น นัดลูกค้า" /></label>
                        <label><span>ประเภท</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as "EVENT" | "TASK" })}><option value="EVENT">Event</option><option value="TASK">Task</option></select></label>
                        <label><span>วันที่</span><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
                        <label><span>ความสำคัญ</span><select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT" })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
                        <label><span>เวลาเริ่ม</span><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} disabled={draft.isAllDay} /></label>
                        <label><span>เวลาสิ้นสุด</span><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} disabled={draft.isAllDay || draft.type === "TASK"} /></label>
                      </div>
                      <label className="item-editor-check"><input type="checkbox" checked={draft.isAllDay} onChange={(event) => setDraft({ ...draft, isAllDay: event.target.checked })} /> เต็มวัน</label>
                      <label><span>รายละเอียด</span><textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" /></label>
                      <div className="item-editor-actions"><button className="today-button" onClick={() => setShowEditor(false)}>ยกเลิก</button><button className="primary-button" onClick={() => void saveItem()} disabled={saving}><Save size={15} /> {saving ? "กำลังบันทึก..." : (editingItem ? "บันทึกการแก้ไข" : "สร้างรายการ")}</button></div>
                    </div>
                  )}

                  <div className="day-item-list">
                    {dayItems.length === 0 ? <div className="modal-empty-state">ยังไม่มีรายการในวันนี้</div> : dayItems.map((item) => {
                      const start = item.startTime ? new Date(item.startTime) : null;
                      const end = item.endTime ? new Date(item.endTime) : null;
                      return <article key={item.id} className="day-item-row">
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.type} · {item.status}{item.priority ? ` · ${item.priority}` : ""}</p>
                          <small>{start ? start.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" }) : "ไม่ระบุเวลา"}{end ? ` - ${end.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" })}` : ""}</small>
                        </div>
                        {manageOpen && <div className="day-item-actions"><button className="today-button" onClick={() => openEditEditor(item)} disabled={Boolean(item.parentRoutineId)}><Pencil size={14} /></button><button className="danger-button" onClick={() => setDeleteTarget({ item, kind: "item" })} disabled={Boolean(item.parentRoutineId)}><Trash2 size={14} /></button></div>}
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
