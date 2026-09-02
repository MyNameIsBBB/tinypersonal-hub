type RateLimitEntry = { timestamps: number[] };

const store = new Map<string, RateLimitEntry>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < 300_000);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, 300_000);
}

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000,
): { success: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetMs = oldest ? Math.max(0, windowMs - (now - oldest)) : windowMs;
    return { success: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return {
    success: true,
    remaining: Math.max(0, limit - entry.timestamps.length),
    resetMs: windowMs,
  };
}
