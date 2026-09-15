import { mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { defineConfig } from "vitest/config";

const testDatabaseDirectory = mkdtempSync(join(tmpdir(), "tinypersonal-vitest-"));
process.env.DATABASE_URL = `file:${join(testDatabaseDirectory, "test.db").replaceAll("\\", "/")}`;
process.env.SESSION_SIGNING_KEY = "vitest-session-signing-key-at-least-32-characters";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "packages/personal-app/src") },
  },
  test: {
    fileParallelism: false,
    globalSetup: "./vitest.global-setup.ts",
  },
});
