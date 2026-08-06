import type {
  ScheduleItem as PrismaScheduleItem,
  ScheduleItemType,
  SchedulePriority,
  ScheduleStatus,
} from "@prisma/client";
import { prisma } from "../db/client";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
export type RecurrenceRule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDays?: Weekday[];
};

export type ScheduleItem = {
  id: string;
  title: string;
  description: string | null;
  type: ScheduleItemType;
  startTime: Date | null;
  endTime: Date | null;
  isAllDay: boolean;
  status: ScheduleStatus;
  priority: SchedulePriority;
  recurrenceRule: string | null;
  routineEndDate: Date | null;
  parentRoutineId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateScheduleItemInput = Omit<
  ScheduleItem,
  "id" | "createdAt" | "updatedAt"
>;

const DAY_MS = 86_400_000;
const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function differenceInDays(left: Date, right: Date): number {
  return Math.floor((startOfUtcDay(left).getTime() - startOfUtcDay(right).getTime()) / DAY_MS);
}

function positiveInterval(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

export function parseRecurrenceRule(value: string): RecurrenceRule {
  if (value.trim().startsWith("{")) {
    const parsed = JSON.parse(value) as Partial<RecurrenceRule>;
    if (!parsed.frequency || !["DAILY", "WEEKLY", "MONTHLY"].includes(parsed.frequency)) {
      throw new Error("Unsupported recurrence frequency");
    }
    return {
      frequency: parsed.frequency,
      interval: positiveInterval(parsed.interval),
      byDays: parsed.byDays?.filter((day): day is Weekday => WEEKDAYS.includes(day)),
    };
  }

  const fields = Object.fromEntries(
    value.replace(/^RRULE:/, "").split(";").map((part) => part.split("=", 2)),
  ) as Record<string, string | undefined>;
  const frequency = fields.FREQ as RecurrenceRule["frequency"] | undefined;
  if (!frequency || !["DAILY", "WEEKLY", "MONTHLY"].includes(frequency)) {
    throw new Error("Unsupported RRULE frequency");
  }
  return {
    frequency,
    interval: positiveInterval(Number(fields.INTERVAL ?? 1)),
    byDays: fields.BYDAY?.split(",").filter((day): day is Weekday =>
      WEEKDAYS.includes(day as Weekday),
    ),
  };
}

function occursOn(date: Date, anchor: Date, rule: RecurrenceRule): boolean {
  const dayDifference = differenceInDays(date, anchor);
  if (dayDifference < 0) return false;

  if (rule.frequency === "DAILY") return dayDifference % rule.interval === 0;
  if (rule.frequency === "WEEKLY") {
    const selectedDays = rule.byDays?.length ? rule.byDays : [WEEKDAYS[anchor.getUTCDay()]];
    return Math.floor(dayDifference / 7) % rule.interval === 0
      && selectedDays.includes(WEEKDAYS[date.getUTCDay()]);
  }

  const monthDifference = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12
    + date.getUTCMonth() - anchor.getUTCMonth();
  return monthDifference >= 0
    && monthDifference % rule.interval === 0
    && date.getUTCDate() === anchor.getUTCDate();
}

export function expandRoutineInstances(
  routine: ScheduleItem,
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleItem[] {
  if (
    routine.type !== "ROUTINE"
    || !routine.startTime
    || !routine.recurrenceRule
    || rangeEnd < rangeStart
  ) return [];

  const rule = parseRecurrenceRule(routine.recurrenceRule);
  const finalDate = routine.routineEndDate && routine.routineEndDate < rangeEnd
    ? routine.routineEndDate
    : rangeEnd;
  if (finalDate < rangeStart || finalDate < routine.startTime) return [];

  const duration = routine.endTime
    ? Math.max(0, routine.endTime.getTime() - routine.startTime.getTime())
    : 0;
  const cursor = startOfUtcDay(rangeStart > routine.startTime ? rangeStart : routine.startTime);
  const instances: ScheduleItem[] = [];

  while (cursor <= finalDate) {
    if (occursOn(cursor, routine.startTime, rule)) {
      const startTime = new Date(cursor);
      startTime.setUTCHours(
        routine.startTime.getUTCHours(),
        routine.startTime.getUTCMinutes(),
        routine.startTime.getUTCSeconds(),
        routine.startTime.getUTCMilliseconds(),
      );
      if (startTime >= rangeStart && startTime <= finalDate) {
        instances.push({
          ...routine,
          id: `${routine.id}:${startTime.toISOString()}`,
          type: "EVENT",
          startTime,
          endTime: duration ? new Date(startTime.getTime() + duration) : null,
          parentRoutineId: routine.id,
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return instances;
}

function toDomain(item: PrismaScheduleItem): ScheduleItem {
  return { ...item };
}

export async function createScheduleItem(input: CreateScheduleItemInput): Promise<ScheduleItem> {
  if (input.type === "ROUTINE" && (!input.recurrenceRule || !input.routineEndDate)) {
    throw new Error("A routine requires recurrenceRule and routineEndDate");
  }
  const item = await prisma.scheduleItem.create({ data: input });
  return toDomain(item);
}

export async function getScheduleByRange(rangeStart: Date, rangeEnd: Date): Promise<ScheduleItem[]> {
  if (rangeEnd < rangeStart) throw new Error("rangeEnd must not be before rangeStart");

  const [records, cancelledInstances] = await prisma.$transaction([
    prisma.scheduleItem.findMany({
      where: {
        parentRoutineId: null,
        status: { not: "CANCELLED" },
        OR: [
          { type: "ROUTINE", startTime: { lte: rangeEnd }, routineEndDate: { gte: rangeStart } },
          { startTime: { gte: rangeStart, lte: rangeEnd } },
          { type: "TASK", startTime: null },
        ],
      },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    }),
    prisma.scheduleItem.findMany({
      where: {
        parentRoutineId: { not: null },
        status: "CANCELLED",
        startTime: { gte: rangeStart, lte: rangeEnd },
      },
      select: { parentRoutineId: true, startTime: true },
    }),
  ]);

  const cancelledKeys = new Set(cancelledInstances.flatMap((item) =>
    item.parentRoutineId && item.startTime
      ? [`${item.parentRoutineId}:${item.startTime.toISOString()}`]
      : [],
  ));

  return records.map(toDomain).flatMap((item) =>
    item.type === "ROUTINE"
      ? expandRoutineInstances(item, rangeStart, rangeEnd).filter((instance) => !cancelledKeys.has(instance.id))
      : [item],
  );
}

export async function updateScheduleStatus(
  id: string,
  status: ScheduleStatus,
): Promise<ScheduleItem> {
  return toDomain(await prisma.scheduleItem.update({ where: { id }, data: { status } }));
}

export async function updateScheduleItem(
  id: string,
  input: Partial<Omit<CreateScheduleItemInput, "parentRoutineId">>,
): Promise<ScheduleItem> {
  const current = await prisma.scheduleItem.findUniqueOrThrow({ where: { id } });
  const type = input.type ?? current.type;
  const recurrenceRule = input.recurrenceRule === undefined ? current.recurrenceRule : input.recurrenceRule;
  const routineEndDate = input.routineEndDate === undefined ? current.routineEndDate : input.routineEndDate;
  if (type === "ROUTINE" && (!recurrenceRule || !routineEndDate)) {
    throw new Error("A routine requires recurrenceRule and routineEndDate");
  }
  return toDomain(await prisma.scheduleItem.update({ where: { id }, data: input }));
}

export async function deleteScheduleItem(id: string): Promise<void> {
  await prisma.scheduleItem.delete({ where: { id } });
}

export async function deleteOrCancelRoutine(
  routineId: string,
  scope: "ALL" | "INSTANCE",
  instanceStartTime?: Date,
): Promise<void> {
  if (scope === "ALL") {
    await prisma.scheduleItem.update({ where: { id: routineId }, data: { status: "CANCELLED" } });
    return;
  }
  if (!instanceStartTime) throw new Error("instanceStartTime is required for INSTANCE scope");

  const routine = toDomain(await prisma.scheduleItem.findUniqueOrThrow({ where: { id: routineId } }));
  const duration = routine.startTime && routine.endTime
    ? routine.endTime.getTime() - routine.startTime.getTime()
    : 0;
  await prisma.scheduleItem.create({
    data: {
      title: routine.title,
      description: "Cancelled routine instance",
      type: "EVENT",
      startTime: instanceStartTime,
      endTime: duration ? new Date(instanceStartTime.getTime() + duration) : null,
      isAllDay: routine.isAllDay,
      status: "CANCELLED",
      priority: routine.priority,
      parentRoutineId: routineId,
    },
  });
}
