import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedValue = { ciphertext: string; iv: string; authTag: string };

function getMasterKey(): Buffer {
  const encoded = process.env.VAULT_MASTER_KEY;
  if (!encoded) throw new Error("VAULT_MASTER_KEY is not configured");

  const key = /^[a-f\d]{64}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("VAULT_MASTER_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptSecret(plaintext: string, context: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(value: EncryptedValue, context: string): string {
  const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(value.iv, "base64"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
