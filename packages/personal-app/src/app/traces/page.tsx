"use client";

import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "@/components/WorkspaceShell";

type TraceContext = {
  source: string;
  entity: string;
  value: string;
  relevance: number;
  confidence: number;
  updatedAt: string;
  sensitivity: "normal" | "private" | "secret";
};

type ToolCall = {
  toolName: string;
  durationMs: number;
  result: "success" | "error";
  summary?: string;
  at: string;
};

type AgentTrace = {
  id: string;
  sessionId: string;
  userMessageId: string;
  intent: string;
  context: TraceContext[];
  allowedTools: string[];
  model: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  toolCalls: ToolCall[];
  finalResponse: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

function formatDuration(milliseconds: number | null, emptyLabel = "กำลังทำงาน") {
  if (milliseconds === null) return emptyLabel;
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function StatusIcon({ status }: { status: AgentTrace["status"] }) {
  if (status === "SUCCEEDED") return <CheckCircle2 size={17} />;
  if (status === "FAILED") return <XCircle size={17} />;
  return <Activity className="trace-pulse" size={17} />;
}

export default function AgentTracesPage() {
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [status, setStatus] = useState("ALL");
  const [intent, setIntent] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/chat/traces?limit=100", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      const data = await response.json() as { traces?: AgentTrace[]; error?: string };
      if (!response.ok || !data.traces) throw new Error(data.error ?? "โหลด Agent Trace ไม่สำเร็จ");
      setTraces(data.traces);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลด Agent Trace ไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!traces.some((trace) => trace.status === "RUNNING")) return;
    const timer = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(timer);
  }, [load, traces]);

  const intents = useMemo(() => [...new Set(traces.map((trace) => trace.intent))].sort(), [traces]);
  const filtered = useMemo(() => traces.filter((trace) =>
    (status === "ALL" || trace.status === status)
    && (intent === "ALL" || trace.intent === intent)), [intent, status, traces]);
  const completed = traces.filter((trace) => trace.status !== "RUNNING");
  const succeeded = traces.filter((trace) => trace.status === "SUCCEEDED").length;
  const timed = completed.filter((trace) => trace.durationMs !== null);
  const averageDuration = timed.length
    ? Math.round(timed.reduce((sum, trace) => sum + (trace.durationMs ?? 0), 0) / timed.length)
    : null;

  return (
    <WorkspaceShell
      active="Agent Trace"
      title="Agent Trace"
      subtitle="ตรวจเส้นทาง intent → context → model → tool → response"
      action={(
        <button className="add-button" disabled={refreshing} onClick={() => void load(true)}>
          <RefreshCw className={refreshing ? "spin-icon" : ""} size={17} />
          <span>รีเฟรช</span>
        </button>
      )}
    >
      <section className="trace-stats" aria-label="สรุป Agent Trace">
        <article><Activity size={18} /><div><span>Runs</span><strong>{traces.length}</strong></div></article>
        <article><CheckCircle2 size={18} /><div><span>Success rate</span><strong>{completed.length ? `${Math.round(succeeded / completed.length * 100)}%` : "—"}</strong></div></article>
        <article><Clock3 size={18} /><div><span>Average</span><strong>{formatDuration(averageDuration, "—")}</strong></div></article>
        <article><Wrench size={18} /><div><span>Tool calls</span><strong>{traces.reduce((sum, trace) => sum + trace.toolCalls.length, 0)}</strong></div></article>
      </section>

      <div className="trace-toolbar">
        <div><BrainCircuit size={17} /><span>ล่าสุด {filtered.length} จาก {traces.length} runs</span></div>
        <label>สถานะ<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">ทั้งหมด</option><option value="RUNNING">Running</option><option value="SUCCEEDED">Succeeded</option><option value="FAILED">Failed</option></select></label>
        <label>Intent<select value={intent} onChange={(event) => setIntent(event.target.value)}><option value="ALL">ทั้งหมด</option>{intents.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      </div>

      {error && <div className="trace-error"><XCircle size={17} />{error}</div>}
      {loading ? <div className="trace-empty"><RefreshCw className="spin-icon" size={22} />กำลังโหลด traces…</div>
        : filtered.length === 0 ? <div className="trace-empty"><Activity size={24} />ยังไม่มี Agent Trace ที่ตรงกับตัวกรอง</div>
        : <section className="trace-list" aria-label="Agent runs">
          {filtered.map((trace) => (
            <details className={`trace-card ${trace.status.toLowerCase()}`} key={trace.id}>
              <summary>
                <span className="trace-status"><StatusIcon status={trace.status} /></span>
                <div className="trace-title"><strong>{trace.intent}</strong><span>Run #{trace.id.slice(-8)} · {formatDate(trace.createdAt)}</span></div>
                <div className="trace-summary-tools">{trace.allowedTools.length ? trace.allowedTools.slice(0, 3).map((tool) => <code key={tool}>{tool}</code>) : <em>no tools</em>}{trace.allowedTools.length > 3 && <small>+{trace.allowedTools.length - 3}</small>}</div>
                <span className="trace-duration"><Clock3 size={13} />{formatDuration(trace.durationMs)}</span>
                <ChevronDown className="trace-chevron" size={17} />
              </summary>

              <div className="trace-detail">
                <section><h2>Run</h2><dl><div><dt>Status</dt><dd>{trace.status}</dd></div><div><dt>Model</dt><dd>{trace.model}</dd></div><div><dt>Session</dt><dd><code>{trace.sessionId}</code></dd></div><div><dt>Message</dt><dd><code>{trace.userMessageId}</code></dd></div></dl></section>
                <section><h2>Allowed tools</h2><div className="trace-tags">{trace.allowedTools.length ? trace.allowedTools.map((tool) => <code key={tool}>{tool}</code>) : <span>ตอบโดยไม่ใช้ tool</span>}</div></section>
                <section><h2>Context</h2>{trace.context.length ? <div className="trace-context-list">{trace.context.map((item, index) => <article key={`${item.source}-${item.entity}-${index}`}><header><strong>{item.source}.{item.entity}</strong><span>{Math.round(item.relevance * 100)}% relevant · {item.sensitivity}</span></header><p>{item.value}</p></article>)}</div> : <p className="trace-muted">ไม่มี context</p>}</section>
                <section><h2>Tool calls</h2>{trace.toolCalls.length ? <div className="trace-tool-list">{trace.toolCalls.map((call, index) => <article className={call.result} key={`${call.toolName}-${call.at}-${index}`}><span>{call.result === "success" ? <CheckCircle2 size={15} /> : <XCircle size={15} />}</span><div><strong>{call.toolName}</strong><p>{call.summary ?? "ไม่มี summary"}</p></div><time>{formatDuration(call.durationMs)}</time></article>)}</div> : <p className="trace-muted">Model ไม่ได้เรียก tool</p>}</section>
                {(trace.finalResponse || trace.error) && <section><h2>{trace.error ? "Error" : "Final response"}</h2><pre className={trace.error ? "trace-response error" : "trace-response"}>{trace.error ?? trace.finalResponse}</pre></section>}
              </div>
            </details>
          ))}
        </section>}
    </WorkspaceShell>
  );
}
