import webpush from "web-push";
import { prisma } from "../db/client";
import { Prisma } from "@prisma/client";
import { getScheduleByRange } from "./scheduleService";

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscription(ownerKey: string, subscription: PushSubscriptionInput) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { ownerKey, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    update: { ownerKey, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    select: { id: true },
  });
}

export async function removePushSubscription(ownerKey: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { ownerKey, endpoint } });
}

export async function hasPushSubscription(ownerKey: string) {
  return (await prisma.pushSubscription.count({ where: { ownerKey } })) > 0;
}

export async function sendWebPushNotification(title: string, body: string, url = "/schedule", ownerKey?: string) {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { ok: false as const, skipped: true, error: "Web Push is not configured" };
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT ?? "mailto:admin@localhost", publicKey, privateKey);
  const subscriptions = await prisma.pushSubscription.findMany({ where: ownerKey ? { ownerKey } : undefined });
  if (!subscriptions.length) return { ok: true as const, skipped: true };
  const payload = JSON.stringify({ title, body, url });
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 3600 });
      return true;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await prisma.pushSubscription.delete({ where: { endpoint: subscription.endpoint } });
      return false;
    }
  }));
  const sent = results.filter(Boolean).length;
  return { ok: sent > 0, sent, error: sent > 0 ? undefined : "No push notification could be delivered" };
}

export async function sendDueScheduleNotifications(now = new Date(), leadMinutes = 15) {
  const windowStart = new Date(now.getTime() + Math.max(0, leadMinutes - 1) * 60_000);
  const windowEnd = new Date(now.getTime() + (leadMinutes + 1) * 60_000);
  const items = (await getScheduleByRange(windowStart, windowEnd)).filter((item) =>
    item.startTime && !item.isAllDay && item.status !== "COMPLETED" && item.status !== "CANCELLED",
  );
  const results: Array<{ itemId: string; ok: boolean; skipped?: boolean; error?: string }> = [];
  for (const item of items) {
    const occurrence = item.startTime!.toISOString();
    const idempotencyKey = `schedule-reminder:${item.id}:${occurrence}:${leadMinutes}`;
    try {
      await prisma.notificationDelivery.create({ data: { idempotencyKey, channel: "web-push", status: "PENDING" } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        results.push({ itemId: item.id, ok: true, skipped: true }); continue;
      }
      throw error;
    }
    const time = item.startTime!.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
    const delivery = await sendWebPushNotification(`อีก ${leadMinutes} นาที: ${item.title}`, `กิจกรรมเริ่มเวลา ${time} น.`, "/schedule");
    await prisma.notificationDelivery.update({
      where: { idempotencyKey_channel: { idempotencyKey, channel: "web-push" } },
      data: { status: delivery.ok ? "SENT" : "FAILED", error: delivery.error },
    });
    results.push({ itemId: item.id, ok: delivery.ok, ...(delivery.skipped && { skipped: true }), ...(delivery.error && { error: delivery.error }) });
  }
  return results;
}
