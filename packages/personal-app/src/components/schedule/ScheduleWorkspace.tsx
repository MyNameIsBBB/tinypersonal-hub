"use client";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "../WorkspaceShell";
import { CalendarView } from "./CalendarView";
import { QuickAIChatInput } from "./QuickAIChatInput";
import { RoutineForm } from "./RoutineForm";
import type { RoutineDraft } from "./RoutineForm";
import type { CalendarItem } from "./CalendarView";

export function ScheduleWorkspace() {
  const [manageOpen, setManageOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"day" | "routine">("day");
  const [showEditor, setShowEditor] = useState(false);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [editingItem, setEditingItem] = useState<CalendarItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    type: "EVENT" as "EVENT" | "TASK",
    date: new Date().toLocaleDateString("en-CA"),
    startTime: "09:00",
    endTime: "10:00",
    isAllDay: false,
    priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  });

  const loadRange = useCallback(async (start = new Date(new Date().getFullYear(), new Date().getMonth(), 1), end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59)) => {
    setLoading(true);
    const response = await fetch(`/api/schedule?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { items?: CalendarItem[] };
    setItems(data.items ?? []); setLoading(false);
  }, []);

  useEffect(() => { void loadRange(); }, [loadRange]);

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
      date: start.toLocaleDateString("en-CA"),
      startTime: item.isAllDay ? "00:00" : start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
      endTime: end ? end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : "10:00",
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
      ? new Date(`${draft.date}T00:00:00`)
      : new Date(`${draft.date}T${draft.startTime}:00`);
    const endTime = draft.isAllDay
      ? new Date(`${draft.date}T23:59:00`)
      : new Date(`${draft.date}T${draft.endTime}:00`);

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
    if (!window.confirm(`ลบรายการ ${item.title} ?`)) return;
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "DELETE" }),
    });
    if (!response.ok) {
      setMessage("ลบไม่สำเร็จ");
      return;
    }
    setMessage("ลบแล้ว");
    await loadRange();
  }

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
    setMessage("สร้าง Routine แล้ว");
    setModalMode("day");
    await loadRange();
  }

  async function toggleStatus(item: CalendarItem) {
    const response = await fetch(`/api/schedule/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" }) });
    if (response.ok) setItems((current) => current.map((value) => value.id === item.id ? { ...value, status: item.status === "COMPLETED" ? "PENDING" : "COMPLETED" } : value));
  }

  const dayItems = items.filter((item) => {
    if (!item.startTime) return false;
    return new Date(item.startTime).toLocaleDateString("en-CA") === selectedDate;
  }).sort((left, right) => {
    if (!left.startTime) return 1;
    if (!right.startTime) return -1;
    return new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
  });

  function closeModal() {
    setModalOpen(false);
    setShowEditor(false);
    setEditingItem(null);
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
    }}>{manageOpen ? "ปิดโหมดจัดการ" : "จัดการ"}</button></div>}>
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
              const dateKey = item.startTime ? new Date(item.startTime).toLocaleDateString("en-CA") : selectedDate;
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
                  <h2>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
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
                  <RoutineForm onCreate={createRoutine} />
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
                          <small>{start ? start.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "ไม่ระบุเวลา"}{end ? ` - ${end.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : ""}</small>
                        </div>
                        {manageOpen && <div className="day-item-actions"><button className="today-button" onClick={() => openEditEditor(item)} disabled={Boolean(item.parentRoutineId)}><Pencil size={14} /></button><button className="danger-button" onClick={() => void deleteItem(item)} disabled={Boolean(item.parentRoutineId)}><Trash2 size={14} /></button></div>}
                      </article>;
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
    </WorkspaceShell>
  );
}
