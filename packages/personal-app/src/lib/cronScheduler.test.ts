import { describe, expect, it, vi } from "vitest";
import {
  getBangkokDateParts,
  runMorningBriefingJob,
  runScheduleNotificationsJob,
  startSchedulerLoop,
} from "../../../../scripts/run-cron-scheduler.mjs";

describe("cron scheduler", () => {
  describe("getBangkokDateParts", () => {
    it("correctly converts UTC to Asia/Bangkok time parts", () => {
      // 01:15 UTC is 08:15 in Asia/Bangkok (UTC+7)
      const date = new Date("2026-09-22T01:15:00Z");
      const parts = getBangkokDateParts(date);
      expect(parts.dateStr).toBe("2026-09-22");
      expect(parts.hour).toBe(8);
      expect(parts.minute).toBe(15);
      expect(parts.minuteKey).toBe("2026-09-22-08:15");
    });

    it("correctly rolls over date at midnight Bangkok time", () => {
      // 17:30 UTC on Sep 22 is 00:30 on Sep 23 in Asia/Bangkok
      const date = new Date("2026-09-22T17:30:00Z");
      const parts = getBangkokDateParts(date);
      expect(parts.dateStr).toBe("2026-09-23");
      expect(parts.hour).toBe(0);
      expect(parts.minute).toBe(30);
      expect(parts.minuteKey).toBe("2026-09-23-00:30");
    });
  });

  describe("job runners", () => {
    it("runScheduleNotificationsJob sends authorized POST", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, deliveries: ["del-1"] }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await runScheduleNotificationsJob("http://127.0.0.1:3000", "secret-token");
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        new URL("/api/jobs/schedule-notifications", "http://127.0.0.1:3000"),
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer secret-token" },
        })
      );
      vi.unstubAllGlobals();
    });

    it("runMorningBriefingJob sends authorized POST", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await runMorningBriefingJob("http://127.0.0.1:3000", "secret-token");
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        new URL("/api/jobs/morning-briefing", "http://127.0.0.1:3000"),
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer secret-token" },
        })
      );
      vi.unstubAllGlobals();
    });
  });

  describe("startSchedulerLoop", () => {
    it("throws if no secret token is provided", async () => {
      await expect(
        startSchedulerLoop({ token: "" })
      ).rejects.toThrow("CRON_SECRET is required");
    });

    it("triggers schedule notifications and briefing on loop iterations", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, deliveries: [] }),
        text: async () => JSON.stringify({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      let ticks = 0;
      await startSchedulerLoop({
        targetUrl: "http://127.0.0.1:3000",
        token: "test-secret",
        intervalMs: 1,
        shouldStop: () => ++ticks >= 2,
      });

      expect(fetchMock).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
