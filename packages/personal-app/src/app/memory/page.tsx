"use client";

import { BrainCircuit, Check, Clock3, RefreshCw, ShieldQuestion, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

type Memory = {
  id: string;
  type: string;
  subject: string;
  claim: string;
  confidence: number;
  source: string;
  evidence: unknown[];
  status: string;
  sensitivity: string;
  observedAt: string;
  lastConfirmedAt: string | null;
  updatedAt: string;
};

type ModelClaim = { claim: string; confidence: number; status: string; evidenceIds: string[] };
type UserModel = { summary: string; traits: ModelClaim[]; motivations: ModelClaim[]; frustrations: ModelClaim[]; decisionStyle: ModelClaim[]; communicationGuidance: ModelClaim[] };
type Snapshot = { id: string; version: number; model: UserModel; createdAt: string; source: string };
type Proposal = { id: string; status: string; proposedModel: UserModel; changes: Array<{ action: string; previousClaim: string | null; proposedClaim: string | null; reason: string; confidence: number }>; createdAt: string };
type TimelineEvent = { id: string; occurredAt: string; category: string; description: string; confidence: number };
type WorkspaceData = { memories: Memory[]; snapshots: Snapshot[]; proposals: Proposal[]; timeline: TimelineEvent[]; runs: Array<{ id: string; status: string; extractedCount: number }> };

const typeLabel: Record<string, string> = {
  fact: "Fact", episode: "Episode", preference: "Preference", project: "Project",
  relationship: "Relationship", inferred_pattern: "Inferred pattern",
};

function date(value: string) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(new Date(value));
}

export default function MemoryPage() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/memory?limit=200", { cache: "no-store" });
      if (response.status === 401) return window.location.assign("/login");
      const result = await response.json() as WorkspaceData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "โหลด memory ไม่สำเร็จ");
      setData(result); setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "โหลด memory ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const memories = useMemo(() => data?.memories.filter((memory) => filter === "all" || memory.type === filter) ?? [], [data, filter]);
  const currentModel = data?.snapshots[0];
  const pending = data?.proposals.find((proposal) => proposal.status === "PENDING");

  async function mutate(url: string, method: "POST" | "PATCH", body?: object) {
    setBusy(url); setError("");
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
      await load();
    } catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : "ดำเนินการไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  const modelSections: Array<[string, ModelClaim[] | undefined]> = [
    ["Traits", currentModel?.model.traits], ["Motivations", currentModel?.model.motivations],
    ["Frustrations", currentModel?.model.frustrations], ["Decision style", currentModel?.model.decisionStyle],
    ["Communication", currentModel?.model.communicationGuidance],
  ];

  return (
    <WorkspaceShell active="Memory" title="Personal Memory" subtitle="ความเข้าใจที่มีหลักฐาน แก้ไขได้ และเปลี่ยนตามเวลา" action={(
      <button className="add-button" disabled={Boolean(busy)} onClick={() => void mutate("/api/memory/reflection", "POST")}><Sparkles size={17} />Reflect now</button>
    )}>
      <div className="memory-page">
        {error && <div className="memory-error"><X size={17} />{error}</div>}
        {loading ? <div className="memory-empty"><RefreshCw className="spin-icon" size={22} />กำลังโหลดความทรงจำ…</div> : <>
          <section className="memory-stats">
            <article><BrainCircuit size={19} /><div><span>Active memories</span><strong>{data?.memories.filter((item) => item.status === "active").length ?? 0}</strong></div></article>
            <article><Sparkles size={19} /><div><span>User model</span><strong>{currentModel ? `v${currentModel.version}` : "ยังไม่มี"}</strong></div></article>
            <article><Clock3 size={19} /><div><span>Timeline events</span><strong>{data?.timeline.length ?? 0}</strong></div></article>
            <article><ShieldQuestion size={19} /><div><span>Needs review</span><strong>{data?.memories.filter((item) => item.status === "disputed").length ?? 0}</strong></div></article>
          </section>

          {pending && <section className="memory-proposal">
            <header><div><span>Reflection proposal</span><h2>ข้อเสนอสำหรับ User Model v{(currentModel?.version ?? -1) + 1}</h2></div><small>{date(pending.createdAt)}</small></header>
            <p>{pending.proposedModel.summary}</p>
            <div className="memory-change-list">{pending.changes.map((change, index) => <article key={index}><b>{change.action}</b><span>{change.proposedClaim ?? change.previousClaim}</span><small>{change.reason} · {Math.round(change.confidence * 100)}%</small></article>)}</div>
            <footer><button disabled={Boolean(busy)} onClick={() => void mutate(`/api/memory/proposals/${pending.id}`, "PATCH", { action: "reject" })}><X size={15} />Reject</button><button disabled={Boolean(busy)} onClick={() => void mutate(`/api/memory/proposals/${pending.id}`, "PATCH", { action: "approve" })}><Check size={15} />Approve new version</button></footer>
          </section>}

          <div className="memory-columns">
            <section className="memory-panel">
              <header><div><span>Current understanding</span><h2>{currentModel ? `User Model v${currentModel.version}` : "ยังไม่มี approved model"}</h2></div>{currentModel && <small>{date(currentModel.createdAt)}</small>}</header>
              {currentModel ? <><p className="memory-summary">{currentModel.model.summary}</p>{modelSections.map(([label, claims]) => claims?.length ? <div className="model-section" key={label}><h3>{label}</h3>{claims.map((claim, index) => <article key={index}><span>{claim.claim}</span><small>{Math.round(claim.confidence * 100)}% · {claim.status} · {claim.evidenceIds.length} evidence</small></article>)}</div> : null)}</> : <div className="memory-empty compact">ระบบจะเสนอ model หลังมี conversations เพียงพอ หรือกด Reflect now</div>}
            </section>

            <section className="memory-panel">
              <header><div><span>Evolution</span><h2>Relationship Timeline</h2></div></header>
              {data?.timeline.length ? <div className="memory-timeline">{data.timeline.map((event) => <article key={event.id}><time>{date(event.occurredAt)}</time><div><b>{event.category.replaceAll("_", " ")}</b><p>{event.description}</p><small>{Math.round(event.confidence * 100)}% confidence</small></div></article>)}</div> : <div className="memory-empty compact">ยังไม่มีเหตุการณ์สำคัญบน timeline</div>}
            </section>
          </div>

          <section className="memory-panel memory-records">
            <header><div><span>Evidence store</span><h2>Structured memories</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">ทุกประเภท</option>{Object.entries(typeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></header>
            {!memories.length ? <div className="memory-empty compact">ยังไม่มี memory ที่ตรงกับตัวกรอง</div> : <div className="memory-grid">{memories.map((memory) => <article className={`memory-card ${memory.status}`} key={memory.id}>
              <header><span>{typeLabel[memory.type] ?? memory.type}</span><small>{Math.round(memory.confidence * 100)}%</small></header>
              <h3>{memory.subject}</h3><p>{memory.claim}</p>
              <div className="memory-evidence">{memory.evidence.slice(0, 3).map((evidence, index) => <small key={index}>“{String(evidence)}”</small>)}</div>
              <footer><time>{date(memory.observedAt)} · {memory.source}</time><div><button title="ยืนยัน" disabled={Boolean(busy)} onClick={() => void mutate(`/api/memory/${memory.id}`, "PATCH", { action: "confirm" })}><Check size={14} /></button><button title="โต้แย้ง" disabled={Boolean(busy)} onClick={() => void mutate(`/api/memory/${memory.id}`, "PATCH", { action: "dispute" })}><ShieldQuestion size={14} /></button><button title="ลืมข้อมูลนี้" disabled={Boolean(busy)} onClick={() => void mutate(`/api/memory/${memory.id}`, "PATCH", { action: "retract" })}><Trash2 size={14} /></button></div></footer>
            </article>)}</div>}
          </section>
        </>}
      </div>
    </WorkspaceShell>
  );
}
