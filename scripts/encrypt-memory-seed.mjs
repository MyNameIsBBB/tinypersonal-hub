import { createCipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("Usage: node scripts/encrypt-memory-seed.mjs <input.txt> <output.json>");
const encodedKey = process.env.MEMORY_SEED_KEY;
if (!encodedKey) throw new Error("MEMORY_SEED_KEY is not configured");
const key = Buffer.from(encodedKey, "base64");
if (key.length !== 32) throw new Error("MEMORY_SEED_KEY must be a base64-encoded 32-byte key");

const aad = "tinypersonal-memory-seed:v1";
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
cipher.setAAD(Buffer.from(aad, "utf8"));
const plaintext = await readFile(resolve(inputPath));
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const payload = {
  version: 1,
  algorithm: "aes-256-gcm",
  aad,
  iv: iv.toString("base64"),
  authTag: cipher.getAuthTag().toString("base64"),
  ciphertext: ciphertext.toString("base64"),
};
await mkdir(dirname(resolve(outputPath)), { recursive: true });
await writeFile(resolve(outputPath), `${JSON.stringify(payload)}\n`, { mode: 0o600 });
console.log(`Encrypted memory seed written to ${resolve(outputPath)}`);
