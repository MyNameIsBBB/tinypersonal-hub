"use client";

import {
  CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, MoreHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

type ViewMode = "day" | "week" | "month";
export type CalendarItem = {
  id: string;
  title: string;
  type: "EVENT" | "TASK" | "ROUTINE";
  startTime: string | null;
  endTime: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  parentRoutineId: string | null;
};

const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const dayLabels = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function CalendarView({ items, loading, onStatusChange, onRangeChange }: {
  items: CalendarItem[];
  loading?: boolean;
  onStatusChange?: (item: CalendarItem) => Promise<void>;
  onRangeChange?: (start: Date, end: Date) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<ViewMode>("month");

  const days = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array(firstDayOffset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [cursor]);

  function moveMonth(amount: number) {
    setCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1);
      onRangeChange?.(next, new Date(next.getFullYear(), next.getMonth() + 1, 0, 23, 59, 59));
      return next;
    });
  }

  const withDate = items.map((item) => ({ ...item, date: item.startTime ? new Date(item.startTime) : null }));
  const forMonth = withDate.filter((item) => !item.date || (item.date.getFullYear() === cursor.getFullYear() && item.date.getMonth() === cursor.getMonth()));

  const visibleItems = view === "day"
    ? forMonth.filter((item) => item.date?.toDateString() === today.toDateString())
    : view === "week"
      ? forMonth.filter((item) => item.date && Math.abs(item.date.getTime() - today.getTime()) <= 7 * 86_400_000)
      : forMonth;

  return (
    <section className="calendar-card" aria-label="ปฏิทินและตารางเวลา">
      <header className="calendar-toolbar">
        <div>
          <p className="eyebrow">Calendar & schedule</p>
          <h2>{thaiMonths[cursor.getMonth()]} {cursor.getFullYear() + 543}</h2>
        </div>
        <div className="calendar-controls">
          <div className="view-switcher" aria-label="รูปแบบปฏิทิน">
            {(["day", "week", "month"] as const).map((mode) => (
              <button key={mode} className={view === mode ? "active" : ""} onClick={() => setView(mode)}>
                {mode === "day" ? "วัน" : mode === "week" ? "สัปดาห์" : "เดือน"}
              </button>
            ))}
          </div>
          <button className="today-button" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>วันนี้</button>
          <div className="arrow-buttons">
            <button aria-label="เดือนก่อนหน้า" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
            <button aria-label="เดือนถัดไป" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
          </div>
        </div>
      </header>

      {view === "month" ? (
        <div className="month-calendar">
          {dayLabels.map((day) => <div className="day-label" key={day}>{day}</div>)}
          {days.map((day, index) => (
            <div className={`calendar-day ${day === today.getDate() && cursor.getMonth() === today.getMonth() ? "today" : ""}`} key={`${day}-${index}`}>
              {day && <span className="day-number">{day}</span>}
              {forMonth.filter((item) => item.date?.getDate() === day).map((item) => (
                <button className={`calendar-event ${item.parentRoutineId ? "routine" : item.type.toLowerCase()} ${item.status === "COMPLETED" ? "completed" : ""}`} key={item.id} onClick={() => void onStatusChange?.(item)} disabled={Boolean(item.parentRoutineId)}>
                  <span>{item.date?.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</span>{item.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="agenda-view">
          {loading ? <div className="empty-state">กำลังโหลดตาราง…</div> : visibleItems.length ? visibleItems.map((item) => (
            <article className={`agenda-item ${item.status === "COMPLETED" ? "completed" : ""}`} key={item.id}>
              <button className="check-button" aria-label="เปลี่ยนสถานะ" onClick={() => void onStatusChange?.(item)} disabled={Boolean(item.parentRoutineId)}><CircleCheck size={22} /></button>
              <div className={`agenda-dot ${item.parentRoutineId ? "routine" : item.type.toLowerCase()}`} />
              <div>
                <p>{item.title}</p>
                <span><CalendarDays size={13} /> {item.date?.toLocaleDateString("th-TH") ?? "ไม่กำหนดวัน"} · <Clock3 size={13} /> {item.date?.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) ?? "ไม่กำหนดเวลา"}</span>
              </div>
              <button className="more-button" aria-label="ตัวเลือกเพิ่มเติม"><MoreHorizontal size={19} /></button>
            </article>
          )) : <div className="empty-state">วันนี้ยังไม่มีรายการ — ลองเพิ่มด้วย AI ด้านบน</div>}
        </div>
      )}
    </section>
  );
}
