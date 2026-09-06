"use client";

import { Check, Circle, ListChecks, Plus, Save, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { AppModal } from "@/components/AppModal";

type Status = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Checklist = { id: string; title: string; isCompleted: boolean; order: number };
type Task = {
  id: string; title: string; description?: string | null; requirements?: string | null;
  status: Status; priority: Priority; deadline?: string | null; startAt?: string | null;
  progressNote?: string | null; completedAt?: string | null; updatedAt: string; checklistItems: Checklist[];
};
type Draft = {
  title: string; description: string; requirements: string; status: Status; priority: Priority;
  deadline: string; startAt: string; progressNote: string; checklist: string[];
};
const emptyDraft: Draft = { title: "", description: "", requirements: "", status: "TODO", priority: "MEDIUM", deadline: "", startAt: "", progressNote: "", checklist: [] };
const statuses: Array<[Status, string]> = [["TODO", "ต้องทำ"], ["IN_PROGRESS", "กำลังทำ"], ["BLOCKED", "ติดปัญหา"], ["DONE", "เสร็จแล้ว"], ["CANCELLED", "ยกเลิก"]];
const priorities: Array<[Priority, string]> = [["LOW", "ต่ำ"], ["MEDIUM", "กลาง"], ["HIGH", "สูง"], ["URGENT", "ด่วน"]];
function localInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function iso(value: string) { return value ? new Date(value).toISOString() : null; }

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "">("");
  const [newChecklist, setNewChecklist] = useState("");
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ q: query });
    if (filter) params.set("status", filter);
    const response = await fetch("/api/tasks?" + params, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const body = await response.json() as { data?: Task[]; error?: string };
    if (!response.ok) { setMessage(body.error ?? "โหลดงานไม่สำเร็จ"); return; }
    setTasks(body.data ?? []);
  }, [filter, query]);
  useEffect(() => { void load(); }, [load]);

  function edit(task: Task) {
    setSelected(task);
    setDraft({ title: task.title, description: task.description ?? "", requirements: task.requirements ?? "",
      status: task.status, priority: task.priority, deadline: localInput(task.deadline), startAt: localInput(task.startAt),
      progressNote: task.progressNote ?? "", checklist: [] });
    setMessage("");
  }
  function fresh() { setSelected(null); setDraft(emptyDraft); setNewChecklist(""); setMessage(""); }
  async function save() {
    if (!draft.title.trim()) { setMessage("กรุณาใส่ชื่องาน"); return; }
    const payload = { ...draft, description: draft.description || null, requirements: draft.requirements || null,
      progressNote: draft.progressNote || null, deadline: iso(draft.deadline), startAt: iso(draft.startAt) };
    const response = await fetch(selected ? "/api/tasks/" + selected.id : "/api/tasks", {
      method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selected ? { ...payload, checklist: undefined } : payload),
    });
    const body = await response.json() as { data?: Task; error?: string };
    if (!response.ok || !body.data) { setMessage(body.error ?? "บันทึกไม่สำเร็จ"); return; }
    edit(body.data); setMessage("บันทึกแล้ว"); await load();
  }
  async function remove() {
    if (!selected) return;
    const response = await fetch("/api/tasks/" + selected.id, { method: "DELETE" });
    setDeleteOpen(false);
    if (!response.ok) { setMessage("ลบงานไม่สำเร็จ"); return; }
    fresh(); await load();
  }
  async function addChecklist() {
    if (!newChecklist.trim()) return;
    if (!selected) { setDraft({ ...draft, checklist: [...draft.checklist, newChecklist.trim()] }); setNewChecklist(""); return; }
    await fetch("/api/tasks/" + selected.id + "/checklist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newChecklist.trim() }) });
    setNewChecklist(""); await refreshSelected();
  }
  async function refreshSelected() {
    if (!selected) return;
    const response = await fetch("/api/tasks/" + selected.id, { cache: "no-store" });
    const body = await response.json() as { data?: Task };
    if (body.data) { edit(body.data); await load(); }
  }
  async function toggle(item: Checklist) {
    if (!selected) return;
    await fetch("/api/tasks/" + selected.id + "/checklist/" + item.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isCompleted: !item.isCompleted }),
    }); await refreshSelected();
  }
  async function removeChecklist(item: Checklist) {
    if (!selected) return;
    await fetch("/api/tasks/" + selected.id + "/checklist/" + item.id, { method: "DELETE" }); await refreshSelected();
  }

  const checklist = selected?.checklistItems ?? draft.checklist.map((title, order) => ({ id: "draft-" + order, title, order, isCompleted: false }));
  return <WorkspaceShell active="Tasks" title="Tasks" subtitle="งานที่ต้องทำให้สำเร็จ พร้อม deadline, requirement และ checklist"
    action={<button className="add-button" onClick={fresh}><Plus size={17} /> สร้าง Task</button>}>
    <div className="module-toolbar task-toolbar">
      <form className="module-search" onSubmit={event => { event.preventDefault(); void load(); }}><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหา Task…" /></form>
      <select value={filter} onChange={event => setFilter(event.target.value as Status | "")}><option value="">ทุกสถานะ</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    <div className="tasks-layout">
      <section className="task-list">
        {tasks.length ? tasks.map(task => {
          const done = task.checklistItems.filter(item => item.isCompleted).length;
          return <button key={task.id} className={"task-card " + (selected?.id === task.id ? "active" : "")} onClick={() => edit(task)}>
            <div><span className={"task-priority " + task.priority.toLowerCase()}>{priorities.find(([value]) => value === task.priority)?.[1]}</span><small>{statuses.find(([value]) => value === task.status)?.[1]}</small></div>
            <h2>{task.title}</h2>
            <p>{task.deadline ? "กำหนดส่ง " + new Date(task.deadline).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "ไม่มีกำหนดส่ง"}</p>
            <footer><ListChecks size={13} /> {done}/{task.checklistItems.length}</footer>
          </button>;
        }) : <div className="empty-state">ยังไม่มี Task</div>}
      </section>
      <article className="task-editor">
        <input className="task-title-input" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="ชื่องาน" />
        <div className="task-grid">
          <label>สถานะ<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Status })}>{statuses.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>ความสำคัญ<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Priority })}>{priorities.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>เริ่มทำ<input type="datetime-local" value={draft.startAt} onChange={event => setDraft({ ...draft, startAt: event.target.value })} /></label>
          <label>Deadline<input type="datetime-local" value={draft.deadline} onChange={event => setDraft({ ...draft, deadline: event.target.value })} /></label>
        </div>
        <label className="task-field">รายละเอียด<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="เป้าหมายและบริบทของงาน" /></label>
        <label className="task-field">Requirements<textarea value={draft.requirements} onChange={event => setDraft({ ...draft, requirements: event.target.value })} placeholder={"เช่น infographic A4\narchitecture diagram\nprototype"} /></label>
        <label className="task-field">Progress note<textarea value={draft.progressNote} onChange={event => setDraft({ ...draft, progressNote: event.target.value })} placeholder="ทำถึงไหนแล้ว เหลืออะไรติดอยู่" /></label>
        <section className="checklist-editor"><h3>Checklist</h3>
          {checklist.map(item => <div className="checklist-row" key={item.id}>
            <button type="button" onClick={() => selected ? void toggle(item) : undefined}>{item.isCompleted ? <Check size={15} /> : <Circle size={15} />}</button>
            <span className={item.isCompleted ? "done" : ""}>{item.title}</span>
            <button type="button" onClick={() => selected ? void removeChecklist(item) : setDraft({ ...draft, checklist: draft.checklist.filter((_, index) => "draft-" + index !== item.id) })}><X size={14} /></button>
          </div>)}
          <div className="checklist-add"><input value={newChecklist} onChange={event => setNewChecklist(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void addChecklist(); } }} placeholder="เพิ่มรายการ…" /><button onClick={() => void addChecklist()}><Plus size={15} /></button></div>
        </section>
        <footer className="editor-actions"><span>{message}</span>{selected && <button className="danger-button" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> ลบ</button>}<button className="primary-button" onClick={() => void save()}><Save size={15} /> บันทึก</button></footer>
      </article>
    </div>
    <AppModal open={deleteOpen} title="ลบ Task นี้?" description={"Checklist ทั้งหมดของ “" + (selected?.title ?? "") + "” จะถูกลบด้วย"} tone="danger" confirmLabel="ลบ Task" cancelLabel="ยกเลิก" busy={false} onConfirm={() => void remove()} onClose={() => setDeleteOpen(false)} />
  </WorkspaceShell>;
}

