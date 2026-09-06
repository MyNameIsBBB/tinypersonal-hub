import { prisma } from "../db/client";
import { taskCreateSchema, taskUpdateSchema, taskIdSchema, taskListSchema, checklistAddSchema, checklistUpdateSchema, checklistDeleteSchema } from "./taskSchemas";

const include = { checklistItems: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] } };
function owner(value: string) {
  if (!value.trim()) throw new Error("Owner is required");
  return value;
}
export async function getTasks(ownerKey: string, input: unknown = {}) {
  const filter = taskListSchema.parse(input);
  return prisma.task.findMany({
    where: {
      ownerKey: owner(ownerKey),
      ...(filter.query ? { OR: [
        { title: { contains: filter.query } },
        { description: { contains: filter.query } },
        { requirements: { contains: filter.query } },
        { progressNote: { contains: filter.query } },
      ] } : {}),
      ...(filter.status ? { status: filter.status } : filter.unfinished ? { status: { notIn: ["DONE", "CANCELLED"] } } : {}),
      ...(filter.deadlineBefore ? { deadline: { lte: new Date(filter.deadlineBefore) } } : {}),
    },
    include, take: filter.limit, orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
}
export async function getTask(ownerKey: string, input: unknown) {
  const { id } = taskIdSchema.parse(input);
  return prisma.task.findFirst({ where: { id, ownerKey: owner(ownerKey) }, include });
}
export async function createTask(ownerKey: string, input: unknown) {
  const { checklist, ...data } = taskCreateSchema.parse(input);
  return prisma.task.create({ data: {
    ...data, ownerKey: owner(ownerKey),
    completedAt: data.status === "DONE" ? new Date() : null,
    checklistItems: { create: checklist.map((title, order) => ({ title, order })) },
  }, include });
}
export async function updateTask(ownerKey: string, input: unknown) {
  const { id, ...data } = taskUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.task.findFirstOrThrow({ where: { id, ownerKey: owner(ownerKey) } });
    return tx.task.update({ where: { id }, data: {
      ...data,
      ...(data.status ? { completedAt: data.status === "DONE" ? current.completedAt ?? new Date() : null } : {}),
    }, include });
  });
}
export async function deleteTask(ownerKey: string, input: unknown) {
  const { id } = taskIdSchema.parse(input);
  const result = await prisma.task.deleteMany({ where: { id, ownerKey: owner(ownerKey) } });
  if (!result.count) throw new Error("Task not found");
  return { id, deleted: true };
}
export async function addTaskChecklistItem(ownerKey: string, input: unknown) {
  const { taskId, title } = checklistAddSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await tx.task.findFirstOrThrow({ where: { id: taskId, ownerKey: owner(ownerKey) } });
    const items = await tx.taskChecklistItem.findMany({ where: { taskId }, select: { order: true } });
    if (items.length >= 100) throw new Error("Checklist limit reached");
    return tx.taskChecklistItem.create({ data: { taskId, title, order: Math.max(-1, ...items.map(item => item.order)) + 1 } });
  });
}
export async function updateTaskChecklistItem(ownerKey: string, input: unknown) {
  const { taskId, id, ...data } = checklistUpdateSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.taskChecklistItem.findFirstOrThrow({ where: { id, taskId, task: { ownerKey: owner(ownerKey) } } });
    return tx.taskChecklistItem.update({ where: { id }, data: {
      ...data,
      ...(data.isCompleted !== undefined ? { completedAt: data.isCompleted ? current.completedAt ?? new Date() : null } : {}),
    } });
  });
}
export async function deleteTaskChecklistItem(ownerKey: string, input: unknown) {
  const { taskId, id } = checklistDeleteSchema.parse(input);
  const result = await prisma.taskChecklistItem.deleteMany({ where: { id, taskId, task: { ownerKey: owner(ownerKey) } } });
  if (!result.count) throw new Error("Checklist item not found");
  return { id, deleted: true };
}

export async function getTodayTasks(ownerKey: string, now = new Date()) {
  const date = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const end = new Date(date + "T23:59:59.999+07:00");
  return prisma.task.findMany({
    where: { ownerKey: owner(ownerKey), status: { notIn: ["DONE", "CANCELLED"] },
      OR: [{ deadline: { lte: end } }, { priority: { in: ["HIGH", "URGENT"] } }] },
    include, take: 20, orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}
