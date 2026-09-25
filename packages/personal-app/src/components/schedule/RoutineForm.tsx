"use client";

import { CalendarDays, Clock3, Repeat2, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

const weekdays = [
  ["MO", "จ"], ["TU", "อ"], ["WE", "พ"], ["TH", "พฤ"],
  ["FR", "ศ"], ["SA", "ส"], ["SU", "อา"],
] as const;

export type RoutineDraft = {
  title: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byDays: string[];
  startTime: string;
  endTime: string;
  endDate: string;
};

export function RoutineForm({ onCreate, initial }: {
  onCreate?: (routine: RoutineDraft) => void | Promise<void>;
  initial?: RoutineDraft;
}) {
  const [selectedDays, setSelectedDays] = useState<string[]>(initial?.byDays ?? ["MO", "WE"]);
  const [frequency, setFrequency] = useState<RoutineDraft["frequency"]>(initial?.frequency ?? "WEEKLY");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(day: string) {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      setError("");
      if (frequency === "WEEKLY" && selectedDays.length === 0) throw new Error("เลือกอย่างน้อย 1 วันสำหรับ Routine รายสัปดาห์");
      await onCreate?.({ title: String(data.get("title")), frequency, interval: Number(data.get("interval")), byDays: frequency === "WEEKLY" ? selectedDays : [], startTime: String(data.get("startTime")), endTime: String(data.get("endTime")), endDate: String(data.get("endDate")) });
      if (!initial) event.currentTarget.reset();
      setSaved(true); window.setTimeout(() => setSaved(false), 2400);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ"); }
  }

  return (
    <section className="routine-card" aria-labelledby="routine-form-title">
      <div className="section-heading">
        <span className="icon-tile"><Repeat2 size={18} /></span>
        <div>
          <p className="eyebrow">{initial ? "Edit routine" : "New routine"}</p>
          <h2 id="routine-form-title">{initial ? "แก้ไข Routine" : "สร้าง Routine ใหม่"}</h2>
        </div>
      </div>

      <form className="routine-form" onSubmit={submit}>
        <label>
          <span>ชื่อกิจวัตร</span>
          <input name="title" defaultValue={initial?.title} placeholder="เช่น ออกกำลังกายตอนเช้า" required />
        </label>

        <div className="form-grid two-columns">
          <label>
            <span>ความถี่</span>
            <select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as RoutineDraft["frequency"])}>
              <option value="DAILY">ทุกวัน</option>
              <option value="WEEKLY">ทุกสัปดาห์</option>
              <option value="MONTHLY">ทุกเดือน</option>
              <option value="YEARLY">ทุกปี</option>
            </select>
          </label>
          <label>
            <span>ทำซ้ำทุก</span>
            <span className="input-suffix">
              <input name="interval" type="number" min="1" max="365" defaultValue={initial?.interval ?? 1} required />
              <small>{frequency === "DAILY" ? "วัน" : frequency === "MONTHLY" ? "เดือน" : frequency === "YEARLY" ? "ปี" : "สัปดาห์"}</small>
            </span>
          </label>
        </div>

        {frequency === "WEEKLY" && <fieldset>
          <legend>วันที่ทำ Routine</legend>
          <div className="weekday-picker">
            {weekdays.map(([value, label]) => (
              <button key={value} type="button" className={selectedDays.includes(value) ? "selected" : ""} aria-pressed={selectedDays.includes(value)} onClick={() => toggleDay(value)}>{label}</button>
            ))}
          </div>
        </fieldset>}

        <div className="form-grid two-columns">
          <label>
            <span><Clock3 size={14} /> เวลาเริ่ม</span>
            <input name="startTime" type="time" defaultValue={initial?.startTime ?? "07:00"} required />
          </label>
          <label>
            <span><Clock3 size={14} /> เวลาสิ้นสุด</span>
            <input name="endTime" type="time" defaultValue={initial?.endTime ?? "08:00"} required />
          </label>
        </div>

        <label className="end-date-field">
          <span><CalendarDays size={14} /> วันสิ้นสุด Routine <strong>จำเป็น</strong></span>
          <input name="endDate" type="date" defaultValue={initial?.endDate} required />
          <small>ระบบจะไม่สร้างกิจกรรมหลังจากวันนี้</small>
        </label>

        <button className="primary-button" type="submit">
          {saved ? "บันทึกแล้ว ✓" : <><Sparkles size={17} /> {initial ? "บันทึกการแก้ไข" : "สร้าง Routine"}</>}
        </button>
        {error && <small className="form-error">{error}</small>}
      </form>
    </section>
  );
}
