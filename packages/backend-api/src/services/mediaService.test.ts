import { describe, expect, it } from "vitest";
import { registerMediaAsset, type StorageDriver } from "./mediaService";

const storage: StorageDriver = { name: "test", put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} };
describe("media signatures", () => {
  it("rejects content that lies about its MIME type before storage", async () => {
    await expect(registerMediaAsset({ fileName: "fake.png", mimeType: "image/png", bytes: new TextEncoder().encode("not a png") }, storage)).rejects.toThrow("does not match");
  });
});
