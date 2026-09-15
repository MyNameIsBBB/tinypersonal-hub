import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineJsonCodec } from "./jsonCodec";

describe("defineJsonCodec", () => {
  const codec = defineJsonCodec(z.object({
    status: z.enum(["queued", "done"]),
    count: z.number().int().nonnegative(),
  }).strict());

  it("validates values before serializing and after parsing", () => {
    const serialized = codec.serialize({ status: "done", count: 2 });
    expect(codec.parse(serialized)).toEqual({ status: "done", count: 2 });
  });

  it("rejects malformed and schema-invalid stored JSON", () => {
    expect(codec.safeParse("not-json").success).toBe(false);
    expect(codec.safeParse(JSON.stringify({ status: "unknown", count: -1 })).success).toBe(false);
  });
});
