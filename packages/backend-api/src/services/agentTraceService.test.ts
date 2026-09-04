import { describe, expect, it } from "vitest";
import { describeAgentError } from "./agentTraceService";

describe("agent trace errors", () => {
  it("unwraps AI SDK error events instead of recording an unknown error", () => {
    expect(describeAgentError({ error: new Error("Provider timed out") })).toBe("Provider timed out");
    expect(describeAgentError({ cause: { message: "Connection reset" } })).toBe("Connection reset");
    expect(describeAgentError({ code: "RATE_LIMITED" })).toBe("AI provider error (RATE_LIMITED)");
  });

  it("redacts credentials from provider messages", () => {
    expect(describeAgentError(new Error("request failed?key=super-secret&mode=stream")))
      .toBe("request failed?key=[redacted]&mode=stream");
    expect(describeAgentError("Authorization Bearer abc.def.ghi rejected"))
      .toBe("Authorization Bearer [redacted] rejected");
  });
});
