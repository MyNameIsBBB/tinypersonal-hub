#!/usr/bin/env node

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = process.cwd();
const TMP_EXPORT = "/tmp/tinyschedule-schedules.json";
const TINY_CONTAINER = process.env.TINY_MONGO_CONTAINER || "tinyschedule-mongo";
const BASE_URL = process.env.IMPORT_BASE_URL || "http://127.0.0.1:3000";

function parseEnv(filePath) {
  const text = readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function toIso(value) {
  if (value && typeof value === "object" && "$date" in value) {
    return toIso(value.$date);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function plusDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function mapWeekdays(days, fallbackIso) {
  const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const list = (Array.isArray(days) ? days : [])
    .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
    .map((v) => map[v]);
  if (list.length) return list;
  const fallbackDay = new Date(fallbackIso).getUTCDay();
  return [map[fallbackDay]];
}

function toPayload(doc) {
  const startTime = toIso(doc.startTime);
  let endTime = toIso(doc.endTime);
  if (!startTime) return null;
  if (!endTime || new Date(endTime) <= new Date(startTime)) {
    endTime = plusDays(startTime, 1);
  }

  const sourceId = (doc._id && typeof doc._id === "object" && "$oid" in doc._id)
    ? doc._id.$oid
    : (doc._id || "unknown");
  const sourceType = doc.routineType || "WEEKLY";

  if (!doc.isRoutine) {
    return {
      title: doc.title || "Imported schedule",
      description: `[imported-from-tinyschedule:${sourceId}]`,
      type: "EVENT",
      startTime,
      endTime,
      isAllDay: Boolean(doc.isAllDay),
      priority: "MEDIUM",
    };
  }

  let frequency = "WEEKLY";
  let interval = 1;
  let byDays;

  if (sourceType === "WEEKLY") {
    frequency = "WEEKLY";
    byDays = mapWeekdays(doc.routineDays, startTime);
  } else if (sourceType === "MONTHLY") {
    frequency = "MONTHLY";
    interval = 1;
  } else {
    // TinySchedule yearly routines are represented as monthly interval 12 in tinypersonal-hub.
    frequency = "MONTHLY";
    interval = 12;
  }

  const recurrenceRule = { frequency, interval, ...(byDays ? { byDays } : {}) };

  return {
    title: doc.title || "Imported routine",
    description: `[imported-from-tinyschedule:${sourceId}] sourceType=${sourceType}`,
    type: "ROUTINE",
    startTime,
    endTime,
    isAllDay: Boolean(doc.isAllDay),
    priority: "MEDIUM",
    recurrenceRule: JSON.stringify(recurrenceRule),
    routineEndDate: plusDays(startTime, 365),
  };
}

async function main() {
  const env = parseEnv(join(PROJECT_ROOT, ".env"));
  const username = env.APP_AUTH_USERNAME;
  const password = env.APP_AUTH_PASSWORD;
  if (!username || !password) {
    throw new Error("APP_AUTH_USERNAME and APP_AUTH_PASSWORD are required in .env");
  }

  execSync(
    `docker exec ${TINY_CONTAINER} mongoexport --db=tinyschedule --collection=Schedule --jsonArray --out=${TMP_EXPORT}`,
    { stdio: "inherit" },
  );
  execSync(`docker cp ${TINY_CONTAINER}:${TMP_EXPORT} ${TMP_EXPORT}`, { stdio: "inherit" });

  const source = JSON.parse(readFileSync(TMP_EXPORT, "utf8"));
  if (!Array.isArray(source) || source.length === 0) {
    console.log("No schedules found in TinySchedule source.");
    return;
  }

  const loginResponse = await fetch(`${BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed with status ${loginResponse.status}`);
  }

  const cookie = loginResponse.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("Missing session cookie from login response");
  }

  const rangeStart = new Date(Date.UTC(2020, 0, 1)).toISOString();
  const rangeEnd = new Date(Date.UTC(2040, 11, 31, 23, 59, 59)).toISOString();
  const existingResponse = await fetch(`${BASE_URL}/api/schedule?start=${encodeURIComponent(rangeStart)}&end=${encodeURIComponent(rangeEnd)}`, {
    headers: { cookie },
  });

  if (!existingResponse.ok) {
    throw new Error(`Cannot fetch existing schedule items: ${existingResponse.status}`);
  }

  const existingData = await existingResponse.json();
  const existingMarkers = new Set(
    (existingData.items || [])
      .map((item) => item?.description)
      .filter((desc) => typeof desc === "string" && desc.includes("[imported-from-tinyschedule:")),
  );

  let created = 0;
  let skipped = 0;
  const failures = [];

  for (const doc of source) {
    const payload = toPayload(doc);
    if (!payload) {
      skipped += 1;
      continue;
    }

    const marker = payload.description;
    if (existingMarkers.has(marker)) {
      skipped += 1;
      continue;
    }

    const response = await fetch(`${BASE_URL}/api/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      created += 1;
      existingMarkers.add(marker);
      continue;
    }

    const body = await response.text().catch(() => "");
    failures.push({ title: payload.title, status: response.status, body });
  }

  console.log(`Imported schedules: created=${created}, skipped=${skipped}, failed=${failures.length}`);
  if (failures.length) {
    mkdirSync(join(PROJECT_ROOT, "logs"), { recursive: true });
    writeFileSync(join(PROJECT_ROOT, "logs", "tinyschedule-import-failures.json"), JSON.stringify(failures, null, 2));
    console.log("Failure details saved to logs/tinyschedule-import-failures.json");
  }

  try {
    unlinkSync(TMP_EXPORT);
  } catch {}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
