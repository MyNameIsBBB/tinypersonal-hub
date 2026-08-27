const baseUrl = process.env.TINYPERSONAL_BASE_URL ?? "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is required");
const response = await fetch(new URL("/api/jobs/schedule-notifications", baseUrl), {
  method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30_000),
});
const result = await response.text();
if (!response.ok) throw new Error(`Schedule notifications failed (${response.status}): ${result}`);
console.log(result);
