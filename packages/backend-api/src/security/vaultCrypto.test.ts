import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./vaultCrypto";

const previous = process.env.VAULT_MASTER_KEY;
afterEach(() => { if (previous === undefined) delete process.env.VAULT_MASTER_KEY; else process.env.VAULT_MASTER_KEY = previous; });

describe("vault crypto", () => {
  it("round-trips with authenticated context", () => {
    process.env.VAULT_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptSecret("correct horse", "service\0account");
    expect(decryptSecret(encrypted, "service\0account")).toBe("correct horse");
    expect(() => decryptSecret(encrypted, "wrong context")).toThrow();
  });
});
