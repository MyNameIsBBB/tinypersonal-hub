import { prisma } from "../db/client";
import { taskFocusSchema } from "./taskSchemas";

const DAY_MS = 86_400_000;
const priorityWeight = { LOW: 0, MEDIUM: 15, HIGH: 30, URGENT: 45 } as const;

export type TaskFocusSource = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: Date | null;
  progressNote: string | null;
  checklistItems: Array<{ title: string; isCompleted: boolean; order: number }>;
};

export type TaskFocusReason = "overdue" | "due-today" | "due-soon" | "priority" | "in-progress" | "blocked";

export type TaskFocusItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  deadline: string | null;
  score: number;
  reasons: TaskFocusReason[];
  overdueDays: number;
  daysUntilDeadline: number | null;
  progressNote: string | null;
  checklist: { completed: number; total: number; remaining: string[] };
};

export type TaskFocus = {
  generatedAt: string;
  timezone: "Asia/Bangkok";
  overdue: TaskFocusItem[];
  dueToday: TaskFocusItem[];
  upcoming: TaskFocusItem[];
  inProgress: TaskFocusItem[];
  recommended: TaskFocusItem[];
  summary: { unfinished: number; overdue: number; dueToday: number; upcoming: number };
};

function bangkokDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function deadlineUrgency(deadline: Date | null, todayStart: Date, todayEnd: Date) {
  if (!deadline) return { weight: 0, overdueDays: 0, daysUntilDeadline: null };
  if (deadline < todayStart) {
    const overdueDays = Math.max(1, Math.ceil((todayStart.getTime() - deadline.getTime()) / DAY_MS));
    return { weight: 100 + Math.min(overdueDays, 30) * 3, overdueDays, daysUntilDeadline: -overdueDays };
  }
  if (deadline <= todayEnd) return { weight: 80, overdueDays: 0, daysUntilDeadline: 0 };
  const daysUntilDeadline = Math.max(1, Math.ceil((deadline.getTime() - todayEnd.getTime()) / DAY_MS));
  const weight = daysUntilDeadline === 1 ? 60
    : daysUntilDeadline === 2 ? 50
    : daysUntilDeadline === 3 ? 40
    : daysUntilDeadline <= 7 ? 30
    : daysUntilDeadline <= 14 ? 15 : 5;
  return { weight, overdueDays: 0, daysUntilDeadline };
}

export function buildTaskFocus(
  tasks: TaskFocusSource[],
  now = new Date(),
  input: { range?: "today" | "week"; limit?: number } = {},
): TaskFocus {
  const parsed = taskFocusSchema.parse(input);
  const today = bangkokDateKey(now);
  const todayStart = new Date(`${today}T00:00:00+07:00`);
  const todayEnd = new Date(todayStart.getTime() + DAY_MS - 1);
  const upcomingEnd = new Date(todayEnd.getTime() + (parsed.range === "week" ? 14 : 7) * DAY_MS);
  const ranked = tasks.map((task): TaskFocusItem => {
    const urgency = deadlineUrgency(task.deadline, todayStart, todayEnd);
    const reasons: TaskFocusReason[] = [];
    if (urgency.overdueDays) reasons.push("overdue");
    else if (urgency.daysUntilDeadline === 0) reasons.push("due-today");
    else if (urgency.daysUntilDeadline !== null && urgency.daysUntilDeadline <= 7) reasons.push("due-soon");
    if (task.priority === "HIGH" || task.priority === "URGENT") reasons.push("priority");
    if (task.status === "IN_PROGRESS") reasons.push("in-progress");
    if (task.status === "BLOCKED") reasons.push("blocked");
    const completed = task.checklistItems.filter(({ isCompleted }) => isCompleted).length;
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline?.toISOString() ?? null,
      score: urgency.weight
        + (priorityWeight[task.priority as keyof typeof priorityWeight] ?? priorityWeight.MEDIUM)
        + (task.status === "IN_PROGRESS" ? 12 : 0)
        + (task.status === "BLOCKED" ? 6 : 0),
      reasons,
      overdueDays: urgency.overdueDays,
      daysUntilDeadline: urgency.daysUntilDeadline,
      progressNote: task.progressNote,
      checklist: {
        completed,
        total: task.checklistItems.length,
        remaining: task.checklistItems.filter(({ isCompleted }) => !isCompleted).slice(0, 5).map(({ title }) => title),
      },
    };
  }).sort((left, right) => right.score - left.score
    || (left.deadline ? Date.parse(left.deadline) : Number.MAX_SAFE_INTEGER) - (right.deadline ? Date.parse(right.deadline) : Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title));

  const overdue = ranked.filter(({ overdueDays }) => overdueDays > 0);
  const dueToday = ranked.filter(({ daysUntilDeadline }) => daysUntilDeadline === 0);
  const upcoming = ranked.filter(({ deadline }) => {
    if (!deadline) return false;
    const value = new Date(deadline);
    return value > todayEnd && value <= upcomingEnd;
  });
  const groupLimit = Math.max(10, parsed.limit);
  return {
    generatedAt: now.toISOString(),
    timezone: "Asia/Bangkok",
    overdue: overdue.slice(0, groupLimit),
    dueToday: dueToday.slice(0, groupLimit),
    upcoming: upcoming.slice(0, groupLimit),
    inProgress: ranked.filter(({ status }) => status === "IN_PROGRESS").slice(0, groupLimit),
    recommended: ranked.slice(0, parsed.limit),
    summary: { unfinished: ranked.length, overdue: overdue.length, dueToday: dueToday.length, upcoming: upcoming.length },
  };
}

export async function getTaskFocus(ownerKey: string, input: unknown = {}, now = new Date()) {
  if (!ownerKey.trim()) throw new Error("Owner is required");
  const parsed = taskFocusSchema.parse(input);
  const tasks = await prisma.task.findMany({
    where: { ownerKey, status: { notIn: ["DONE", "CANCELLED"] } },
    include: { checklistItems: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
    take: 200,
  });
  return buildTaskFocus(tasks, now, parsed);
}
