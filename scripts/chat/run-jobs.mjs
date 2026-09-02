const baseUrl = process.env.INTERNAL_APP_URL ?? "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is required for the chat generation runner");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
for (;;) {
  try {
    const response = await fetch(new URL("/api/jobs/chat", baseUrl), { method: "POST", headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(11 * 60_000) });
    if (!response.ok && response.status !== 204) console.error(new Date().toISOString(), `Chat runner HTTP ${response.status}`);
    await wait(response.status === 204 ? 2_000 : 250);
  } catch (error) {
    console.error(new Date().toISOString(), error instanceof Error ? error.message : error);
    await wait(5_000);
  }
}
