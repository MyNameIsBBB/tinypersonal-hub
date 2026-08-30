#!/usr/bin/env node

import { execFile } from "node:child_process";
import { chmod, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const socketPath = process.env.CODEX_WORKER_SOCKET ?? "/tmp/tinypersonal-codex-worker/worker.sock";
const projectRoot = resolve(process.env.CODEX_WORKER_PROJECT_ROOT ?? "/home/best/production-app");
const codexExecutable = process.env.CODEX_EXECUTABLE ?? "codex";
const maxOutput = 2_000_000;
const timeout = 30 * 60_000;

function validInput(value) {
  return value && typeof value === "object"
    && typeof value.instruction === "string"
    && value.instruction.trim().length >= 3
    && value.instruction.length <= 20_000
    && (value.branchName === undefined || (typeof value.branchName === "string" && /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/.test(value.branchName)))
    && typeof value.autoPush === "boolean"
    && (!value.autoPush || Boolean(value.branchName));
}

async function run(program, args) {
  const command = [program, ...args].join(" ");
  try {
    const { stdout, stderr } = await execFileAsync(program, args, { cwd: projectRoot, timeout, maxBuffer: maxOutput, windowsHide: true });
    return { command, stdout, stderr, exitCode: 0 };
  } catch (error) {
    const log = { command, stdout: error.stdout ?? "", stderr: error.stderr ?? error.message, exitCode: typeof error.code === "number" ? error.code : 1 };
    throw Object.assign(new Error(`Command failed: ${command}`), { log });
  }
}

async function executeTask(input) {
  const logs = [];
  let branch = null;
  const execute = async (program, args) => {
    try {
      const log = await run(program, args);
      logs.push(log);
      return log;
    } catch (error) {
      if (error.log) logs.push(error.log);
      throw error;
    }
  };
  try {
    const requestedBranch = input.branchName ?? "Choose a concise codex/* branch name based on the task";
    const delivery = input.autoPush
      ? "After validation succeeds, stage only task-related files, commit with a concise conventional message, and push the branch to origin with upstream tracking."
      : "Do not commit and do not push. Leave the validated task changes in the working tree for review.";
    const instruction = `Own this coding task end-to-end inside the current repository.

User task:
${input.instruction}

Required workflow:
1. Read AGENTS.md and inspect repository status. Preserve unrelated changes and never use destructive Git commands.
2. Run git pull --ff-only. If it cannot run safely, stop and report the exact blocker.
3. Create and switch to this branch: ${requestedBranch}.
4. Implement the requested change following repository architecture and conventions.
5. Run relevant tests and builds. Fix failures caused by the task until validation passes or a concrete blocker remains.
6. ${delivery}
7. Summarize the branch, changed files, tests/build, commit, and push status.

Stay within this repository. Never expose secrets or modify unrelated files.`;
    await execute(codexExecutable, ["--ask-for-approval", "never", "--sandbox", "workspace-write", "--cd", projectRoot, "exec", "--json", instruction]);
    branch = (await execute("git", ["branch", "--show-current"])).stdout.trim() || input.branchName || "HEAD";
    return { ok: true, data: { branch, logs } };
  } catch (error) {
    return { ok: false, error: { code: "CODING_TASK_FAILED", message: error instanceof Error ? error.message : "Coding task failed" }, data: { branch, logs } };
  }
}

await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
await rm(socketPath, { force: true });
const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/coding-task") {
    response.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 25_000) {
      response.writeHead(413).end();
      return;
    }
  }
  let input;
  try { input = JSON.parse(raw); } catch { input = null; }
  if (!validInput(input)) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: { code: "INVALID_INPUT", message: "Invalid coding task" }, data: { branch: null, logs: [] } }));
    return;
  }
  const result = await executeTask(input);
  response.writeHead(result.ok ? 200 : 500, { "Content-Type": "application/json" });
  response.end(JSON.stringify(result));
});
server.listen(socketPath, async () => {
  await chmod(socketPath, 0o666);
  console.log(`Codex worker listening on ${socketPath} for ${projectRoot}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
