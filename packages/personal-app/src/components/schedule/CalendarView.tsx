"use client";

import {
  CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, MoreHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";

const BANGKOK_TZ = "Asia/Bangkok";
const BANGKOK_OFFSET_HOURS = 7;
const DAY_MS = 86_400_000;

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

function bangkokDayStartUtcMs(date: Date): number {
  const local = toBangkokWallClock(date);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

function parseDateKeyToUtcMs(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

type ViewMode = "day" | "week" | "month";
export type CalendarItem = {
  id: string;
  title: string;
  description?: string | null;
  type: "EVENT" | "TASK" | "ROUTINE";
  startTime: string | null;
  endTime: string | null;
  isAllDay?: boolean;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  parentRoutineId: string | null;
};

const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const dayLabels = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export function CalendarView({ items, loading, onStatusChange, onRangeChange, onDateSelect, onItemSelect, selectedDateKey }: {
  items: CalendarItem[];
  loading?: boolean;
  onStatusChange?: (item: CalendarItem) => Promise<void>;
  onRangeChange?: (start: Date, end: Date) => void;
  onDateSelect?: (dateKey: string) => void;
  onItemSelect?: (item: CalendarItem) => void;
  selectedDateKey?: string;
}) {
  const now = new Date();
  const bangkokToday = toBangkokWallClock(now);
  const [cursor, setCursor] = useState(new Date(bangkokToday.getUTCFullYear(), bangkokToday.getUTCMonth(), 1));
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
  const forMonth = withDate.filter((item) => {
    if (!item.date) return true;
    const local = toBangkokWallClock(item.date);
    return local.getUTCFullYear() === cursor.getFullYear() && local.getUTCMonth() === cursor.getMonth();
  });

  const focusDayStartMs = selectedDateKey ? parseDateKeyToUtcMs(selectedDateKey) : bangkokDayStartUtcMs(now);

  const visibleItems = view === "day"
    ? forMonth.filter((item) => item.date && bangkokDayStartUtcMs(item.date) === focusDayStartMs)
    : view === "week"
      ? forMonth.filter((item) => item.date && Math.abs(bangkokDayStartUtcMs(item.date) - focusDayStartMs) <= 6 * DAY_MS)
      : forMonth;

  function dateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

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
          <button className="today-button" onClick={() => {
            const currentBangkok = toBangkokWallClock(new Date());
            setCursor(new Date(currentBangkok.getUTCFullYear(), currentBangkok.getUTCMonth(), 1));
          }}>วันนี้</button>
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
            <div
              className={`calendar-day ${day === bangkokToday.getUTCDate() && cursor.getMonth() === bangkokToday.getUTCMonth() && cursor.getFullYear() === bangkokToday.getUTCFullYear() ? "today" : ""} ${day && selectedDateKey === dateKey(cursor.getFullYear(), cursor.getMonth(), day) ? "selected" : ""}`}
              key={`${day}-${index}`}
              onClick={() => {
                if (!day) return;
                onDateSelect?.(dateKey(cursor.getFullYear(), cursor.getMonth(), day));
              }}
            >
              {day && <span className="day-number">{day}</span>}
              {forMonth.filter((item) => item.date && toBangkokWallClock(item.date).getUTCDate() === day).map((item) => (
                <button
                  className={`calendar-event ${item.parentRoutineId ? "routine" : item.type.toLowerCase()} ${item.status === "COMPLETED" ? "completed" : ""}`}
                  key={item.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onItemSelect?.(item);
                  }}
                >
                  <span>{item.date?.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" })}</span>{item.title}
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
                <span><CalendarDays size={13} /> {item.date?.toLocaleDateString("th-TH", { timeZone: BANGKOK_TZ }) ?? "ไม่กำหนดวัน"} · <Clock3 size={13} /> {item.date?.toLocaleTimeString("th-TH", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit" }) ?? "ไม่กำหนดเวลา"}</span>
              </div>
              <button className="more-button" aria-label="ตัวเลือกเพิ่มเติม" onClick={() => onItemSelect?.(item)}><MoreHorizontal size={19} /></button>
            </article>
          )) : <div className="empty-state">วันนี้ยังไม่มีรายการ — ลองเพิ่มด้วย AI ด้านบน</div>}
        </div>
      )}
    </section>
  );
}
