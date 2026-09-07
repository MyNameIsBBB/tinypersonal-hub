import { getScheduleByRange, type ScheduleItem } from "./scheduleService";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { getMarketQuotes, type MarketQuote } from "./integrations";
import { sendWebPushNotification } from "./pushService";
import { getTaskFocus, type TaskFocus } from "./taskFocusService";

export type NewsHeadline = {
  title: string;
  source: string | null;
  publishedAt: string | null;
  link: string | null;
};

export type MorningBriefingContext = {
  date: string;
  timezone: string;
  schedule: ScheduleItem[];
  news: NewsHeadline[];
  markets: MarketQuote[];
  taskFocus: TaskFocus;
};

export type NotificationResult = {
  channel: "discord" | "web-push";
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

function bangkokDayRange(now: Date): { start: Date; end: Date; date: string } {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const start = new Date(`${date}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86_400_000 - 1), date };
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
}

function xmlValue(item: string, tag: string): string | null {
  const value = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1];
  return value ? decodeXml(value) : null;
}

async function fetchImportantNews(): Promise<NewsHeadline[]> {
  const endpoint = process.env.NEWS_RSS_URL ?? "https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th";
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(8_000),
    headers: { "User-Agent": "TinyPersonal-Hub/1.0" },
  });
  if (!response.ok) throw new Error(`News feed returned ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 12).flatMap((match) => {
    const title = xmlValue(match[1], "title");
    if (!title) return [];
    return [{ title, source: xmlValue(match[1], "source"), publishedAt: xmlValue(match[1], "pubDate"), link: xmlValue(match[1], "link") }];
  });
}

export async function getMorningBriefingContext(ownerKey: string, now = new Date()): Promise<MorningBriefingContext> {
  const { start, end, date } = bangkokDayRange(now);
  const [schedule, taskFocus, news, markets] = await Promise.all([
    getScheduleByRange(start, end),
    getTaskFocus(ownerKey, { range: "today", limit: 5 }, now),
    fetchImportantNews().catch(() => []),
    getMarketQuotes().catch(() => []),
  ]);
  return { date, timezone: "Asia/Bangkok", schedule, taskFocus, news, markets };
}

async function reserveDelivery(idempotencyKey: string, channel: NotificationResult["channel"]): Promise<boolean> {
  try {
    await prisma.notificationDelivery.create({ data: { idempotencyKey, channel, status: "PENDING" } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

async function finishDelivery(idempotencyKey: string, result: NotificationResult): Promise<void> {
  await prisma.notificationDelivery.update({
    where: { idempotencyKey_channel: { idempotencyKey, channel: result.channel } },
    data: { status: result.ok ? "SENT" : "FAILED", error: result.error },
  });
}

export async function sendMorningNotification(message: string, idempotencyKey: string, ownerKey?: string): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  if (process.env.DISCORD_WEBHOOK_URL) {
    if (!await reserveDelivery(idempotencyKey, "discord")) results.push({ channel: "discord", ok: true, skipped: true });
    else {
    let result: NotificationResult;
    try {
      const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message }), signal: AbortSignal.timeout(8_000),
      });
      result = { channel: "discord", ok: response.ok, ...(!response.ok && { error: `HTTP ${response.status}` }) };
    } catch (error) {
      result = { channel: "discord", ok: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
    results.push(result); await finishDelivery(idempotencyKey, result);
    }
  }
  if (process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY) {
    if (!await reserveDelivery(idempotencyKey, "web-push")) results.push({ channel: "web-push", ok: true, skipped: true });
    else {
      const push = await sendWebPushNotification("สรุปเช้าจาก TinyPersonal", message, "/ai", ownerKey);
      const result: NotificationResult = { channel: "web-push", ok: push.ok, ...(push.skipped && { skipped: true }), ...(push.error && { error: push.error }) };
      results.push(result); await finishDelivery(idempotencyKey, result);
    }
  }
  return results;
}
