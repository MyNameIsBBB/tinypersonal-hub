import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export default function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) throw new Error("Vitest requires an isolated SQLite DATABASE_URL");
  const databasePath = databaseUrl.slice("file:".length);
  const migrationsDirectory = join(import.meta.dirname, "packages/backend-api/prisma/migrations");

  for (const entry of readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const migration = readFileSync(join(migrationsDirectory, entry.name, "migration.sql"));
    execFileSync("/usr/bin/sqlite3", [databasePath], { input: migration, stdio: ["pipe", "pipe", "pipe"] });
  }

  return () => {
    const directory = dirname(databasePath);
    if (!directory.startsWith("/tmp/tinypersonal-vitest-")) throw new Error("Refusing to remove a non-test directory");
    rmSync(directory, { recursive: true, force: true });
  };
}
