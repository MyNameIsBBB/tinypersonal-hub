import { afterEach, describe, expect, it } from "vitest";
import { isCronAuthorizedRequest } from "./serverAuth";

const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe("isCronAuthorizedRequest", () => {
  it("accepts the configured bearer secret", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const request = new Request("http://localhost", {
      headers: { Authorization: "Bearer test-cron-secret" },
    });
    expect(isCronAuthorizedRequest(request)).toBe(true);
  });

  it("rejects missing or incorrect credentials", () => {
    process.env.CRON_SECRET = "test-cron-secret";
    expect(isCronAuthorizedRequest(new Request("http://localhost"))).toBe(false);
    expect(isCronAuthorizedRequest(new Request("http://localhost", {
      headers: { Authorization: "Bearer incorrect" },
    }))).toBe(false);
  });
});
