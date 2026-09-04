import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export default function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) throw new Error("Vitest requires an isolated SQLite DATABASE_URL");
  const databasePath = databaseUrl.slice("file:".length);
  const migrationsDirectory = join(import.meta.dirname, "packages/backend-api/prisma/migrations");
  const schemaPath = join(import.meta.dirname, "packages/backend-api/prisma/schema.prisma");
  const prismaCli = join(import.meta.dirname, "node_modules/prisma/build/index.js");

  try {
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
      cwd: import.meta.dirname,
      env: process.env,
      stdio: "pipe",
    });
  } catch (prismaError) {
    try {
      for (const entry of readdirSync(migrationsDirectory, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const migration = readFileSync(join(migrationsDirectory, entry.name, "migration.sql"));
        execFileSync("sqlite3", [databasePath], { input: migration, stdio: ["pipe", "pipe", "pipe"] });
      }
    } catch (sqliteError) {
      throw new AggregateError(
        [prismaError, sqliteError],
        "Unable to prepare the integration-test database with Prisma or sqlite3",
      );
    }
  }

  return () => {
    const directory = dirname(databasePath);
    if (!directory.startsWith("/tmp/tinypersonal-vitest-")) throw new Error("Refusing to remove a non-test directory");
    rmSync(directory, { recursive: true, force: true });
  };
}
