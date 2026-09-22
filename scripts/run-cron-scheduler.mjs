#!/usr/bin/env node

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

const baseUrl = process.env.INTERNAL_APP_URL ?? process.env.TINYPERSONAL_BASE_URL ?? "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET;

export function getBangkokDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const dateStr = `${year}-${month}-${day}`;
  const minuteKey = `${dateStr}-${get("hour")}:${get("minute")}`;
  return { dateStr, hour, minute, minuteKey };
}

export async function runScheduleNotificationsJob(targetUrl = baseUrl, token = secret) {
  try {
    const response = await fetch(new URL("/api/jobs/schedule-notifications", targetUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(new Date().toISOString(), `[scheduler] schedule-notifications failed (${response.status}): ${errText}`);
      return false;
    }
    const result = await response.json();
    if (result?.deliveries?.length > 0) {
      console.log(new Date().toISOString(), `[scheduler] Delivered ${result.deliveries.length} schedule notification(s).`);
    }
    return true;
  } catch (error) {
    console.error(new Date().toISOString(), "[scheduler] Error running schedule notifications:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function runMorningBriefingJob(targetUrl = baseUrl, token = secret) {
  try {
    const response = await fetch(new URL("/api/jobs/morning-briefing", targetUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(new Date().toISOString(), `[scheduler] morning-briefing failed (${response.status}): ${errText}`);
      return false;
    }
    console.log(new Date().toISOString(), "[scheduler] Morning briefing completed successfully.");
    return true;
  } catch (error) {
    console.error(new Date().toISOString(), "[scheduler] Error running morning briefing:", error instanceof Error ? error.message : error);
    return false;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * @param {Object} [options]
 * @param {string} [options.targetUrl]
 * @param {string} [options.token]
 * @param {number} [options.intervalMs]
 * @param {() => boolean} [options.shouldStop]
 * @param {Function} [options.onTick]
 */
export async function startSchedulerLoop({
  targetUrl = baseUrl,
  token = secret,
  intervalMs = 10_000,
  shouldStop = () => false,
  onTick,
} = {}) {
  if (!token) {
    throw new Error("CRON_SECRET is required for the cron scheduler");
  }

  let lastScheduleMinuteKey = "";
  let lastBriefingDate = "";

  console.log(new Date().toISOString(), `[scheduler] Background cron scheduler started (target: ${targetUrl})`);

  while (!shouldStop()) {
    const now = new Date();
    const { dateStr, hour, minuteKey } = getBangkokDateParts(now);

    // 1. Minute job: Schedule notifications (runs once every minute)
    if (lastScheduleMinuteKey !== minuteKey) {
      lastScheduleMinuteKey = minuteKey;
      runScheduleNotificationsJob(targetUrl, token).catch(() => {});
    }

    // 2. Daily job: Morning briefing (runs once at 08:00 Asia/Bangkok)
    if (hour === 8 && lastBriefingDate !== dateStr) {
      lastBriefingDate = dateStr;
      runMorningBriefingJob(targetUrl, token).catch(() => {});
    }

    if (typeof onTick === "function") {
      onTick({ now, dateStr, hour, minuteKey, lastBriefingDate, lastScheduleMinuteKey });
    }

    await wait(intervalMs);
  }
}

// Start execution if run directly from CLI / child process
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ""))) {
  if (!secret) {
    console.error("CRON_SECRET is required for the cron scheduler");
    process.exit(1);
  }
  startSchedulerLoop().catch((err) => {
    console.error("Fatal scheduler error:", err);
    process.exit(1);
  });
}
