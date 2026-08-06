"use client";

import { Folder, Plus, Save, Search, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

type Note = { id: string; title: string; content: string; tags: string[]; folder?: string | null; scheduleItemId?: string | null; createdAt: string; updatedAt: string };
const emptyDraft = { title: "", content: "", tags: [] as string[], folder: "", scheduleItemId: null as string | null };

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (search = "") => {
    const response = await fetch(`/api/notes?q=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (response.status === 401) { window.location.assign("/login"); return; }
    const data = await response.json() as { notes: Note[] }; setNotes(data.notes);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function select(note: Note) { setSelectedId(note.id); setDraft({ title: note.title, content: note.content, tags: note.tags, folder: note.folder ?? "", scheduleItemId: note.scheduleItemId ?? null }); }
  function fresh() { setSelectedId(null); setDraft(emptyDraft); setMessage(""); }
  async function save() {
    if (!draft.title.trim()) { setMessage("กรุณาใส่ชื่อโน้ต"); return; }
    const response = await fetch(selectedId ? `/api/notes/${selectedId}` : "/api/notes", { method: selectedId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const data = await response.json() as { note?: Note; error?: string };
    if (!response.ok || !data.note) { setMessage(data.error ?? "บันทึกไม่สำเร็จ"); return; }
    setSelectedId(data.note.id); setMessage("บันทึกแล้ว"); await load(query);
  }
  async function remove() { if (!selectedId || !window.confirm("ลบโน้ตนี้หรือไม่?")) return; await fetch(`/api/notes/${selectedId}`, { method: "DELETE" }); fresh(); await load(query); }

  return <WorkspaceShell active="Notes" title="Notes & Knowledge" subtitle="Markdown, tags และบริบทที่ค้นหาได้" action={<button className="add-button" onClick={fresh}><Plus size={17} /><span>เขียนโน้ต</span></button>}>
    <div className="module-toolbar"><form className="module-search" onSubmit={(event) => { event.preventDefault(); void load(query); }}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาเนื้อหา, tag หรือ folder…" /></form></div>
    <div className="notes-layout">
      <section className="note-list">
        {notes.length ? notes.map((note) => <button className={`note-row ${selectedId === note.id ? "active" : ""}`} key={note.id} onClick={() => select(note)}>
          <div><span className="note-folder"><Folder size={12} /> {note.folder || "Inbox"}</span><small>{new Date(note.updatedAt).toLocaleDateString("th-TH")}</small></div>
          <h2>{note.title}</h2><p>{note.content || "ยังไม่มีเนื้อหา"}</p><footer>{note.tags.map((tag) => <span key={tag}><Tag size={10} /> {tag}</span>)}</footer>
        </button>) : <div className="empty-state">ยังไม่มีโน้ต เริ่มเขียนโน้ตแรกได้เลย</div>}
      </section>
      <article className="note-editor real-editor">
        <div className="editor-fields"><input aria-label="ชื่อโน้ต" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="ชื่อโน้ต" /><div><input aria-label="โฟลเดอร์" value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })} placeholder="Folder" /><input aria-label="แท็ก" value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} placeholder="tags, comma, separated" /></div></div>
        <textarea className="markdown-textarea" aria-label="เนื้อหา Markdown" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="เขียน Markdown ที่นี่…" />
        <footer className="editor-actions"><span>{message}</span>{selectedId && <button className="danger-button" onClick={() => void remove()}><Trash2 size={15} /> ลบ</button>}<button className="primary-button" onClick={() => void save()}><Save size={15} /> บันทึก</button></footer>
      </article>
    </div>
  </WorkspaceShell>;
}
