import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { request } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 2_000_000;
const COMMAND_TIMEOUT_MS = 30 * 60_000;

const delegateCodingTaskSchema = z.object({
  instruction: z.string().trim().min(3).max(20_000),
  branchName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/).optional(),
  autoPush: z.boolean().default(false),
}).strict().superRefine(({ autoPush, branchName }, context) => {
  if (autoPush && !branchName) context.addIssue({ code: z.ZodIssueCode.custom, path: ["branchName"], message: "branchName is required when autoPush is enabled" });
});
const controlSmartHomeDeviceSchema = z.object({
  domain: z.enum(["climate", "switch", "light"]), service: z.enum(["turn_on", "turn_off", "set_temperature"]),
  entityId: z.string().trim().regex(/^(climate|switch|light)\.[a-z0-9_]+$/),
  payload: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
}).strict().superRefine(({ domain, service, entityId }, context) => {
  if (!entityId.startsWith(`${domain}.`)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["entityId"], message: "entityId must belong to the selected domain" });
  if (service === "set_temperature" && domain !== "climate") context.addIssue({ code: z.ZodIssueCode.custom, path: ["service"], message: "set_temperature is only valid for climate entities" });
});

export type ExecutionLog = { command: string; stdout: string; stderr: string; exitCode: number };
export type CodingTaskResult =
  | { ok: true; data: { branch: string; logs: ExecutionLog[] } }
  | { ok: false; error: { code: "CODING_TASK_FAILED" | "INVALID_PROJECT_ROOT" | "INVALID_INPUT"; message: string }; data: { branch: string | null; logs: ExecutionLog[] } };

export type ProgressCallback = (progress: { kind: "status" | "command" | "file" | "tool"; message: string }) => void;

function delegateToHostWorker(
  input: z.infer<typeof delegateCodingTaskSchema>,
  socketPath: string,
  onProgress?: ProgressCallback
): Promise<CodingTaskResult> {
  return new Promise((resolveResult) => {
    const body = JSON.stringify(input);
    let pending = "";
    let resolved = false;

    const safeResolve = (res: CodingTaskResult) => {
      if (!resolved) {
        resolved = true;
        resolveResult(res);
      }
    };

    const workerRequest = request({
      socketPath,
      path: "/coding-task",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: COMMAND_TIMEOUT_MS + 5_000,
    }, (response) => {
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "progress" && parsed.progress && onProgress) {
              onProgress(parsed.progress);
            } else if (parsed.type === "result" && parsed.result) {
              safeResolve(parsed.result);
            }
          } catch {}
        }
      });
      response.on("end", () => {
        if (pending.trim()) {
          try {
            const parsed = JSON.parse(pending);
            if (parsed.type === "result" && parsed.result) {
              return safeResolve(parsed.result);
            }
            if ("ok" in parsed) {
              return safeResolve(parsed as CodingTaskResult);
            }
          } catch {}
        }
        if (!resolved) {
          safeResolve({ ok: false, error: { code: "CODING_TASK_FAILED", message: "Codex worker returned an incomplete response" }, data: { branch: null, logs: [] } });
        }
      });
    });
    workerRequest.on("timeout", () => workerRequest.destroy(new Error("Codex worker timed out")));
    workerRequest.on("error", (error) => safeResolve({ ok: false, error: { code: "CODING_TASK_FAILED", message: `Codex worker unavailable: ${error.message}` }, data: { branch: null, logs: [] } }));
    workerRequest.end(body);
  });
}

async function run(executable: string, args: string[], cwd: string): Promise<ExecutionLog> {
  const command = [executable, ...args].join(" ");
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true });
    return { command, stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string; code?: number | string };
    const result = { command, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message, exitCode: typeof failure.code === "number" ? failure.code : 1 };
    throw Object.assign(new Error(`Command failed: ${command}`), { result });
  }
}

export async function delegateCodingTask(untrustedInput: unknown, onProgress?: ProgressCallback): Promise<CodingTaskResult> {
  const parsed = delegateCodingTaskSchema.safeParse(untrustedInput);
  if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid coding task" }, data: { branch: null, logs: [] } };
  const input = parsed.data;
  if (process.env.CODEX_WORKER_SOCKET) {
    return delegateToHostWorker(input, process.env.CODEX_WORKER_SOCKET, onProgress);
  }
  onProgress?.({ kind: "status", message: "เริ่ม Codex CLI และตรวจสอบ repository" });
  const projectRoot = resolve(process.env.JARVIS_PROJECT_ROOT ?? process.cwd());
  const logs: ExecutionLog[] = [];
  let branch: string | null = null;
  try {
    await access(resolve(projectRoot, ".git"));
  } catch {
    return { ok: false, error: { code: "INVALID_PROJECT_ROOT", message: `JARVIS_PROJECT_ROOT is not a Git repository: ${projectRoot}` }, data: { branch, logs } };
  }

  const execute = async (program: string, args: string[]) => {
    try { const log = await run(program, args, projectRoot); logs.push(log); return log; }
    catch (error) { const result = (error as { result?: ExecutionLog }).result; if (result) logs.push(result); throw error; }
  };

  try {
    const requestedBranch = input.branchName ?? "Choose a concise codex/* branch name based on the task";
    const delivery = input.autoPush
      ? "After validation succeeds, stage only task-related files, commit with a concise conventional message, and push the branch to origin with upstream tracking."
      : "Do not commit and do not push. Leave the validated task changes in the working tree for review.";
    const agentInstruction = `Own this coding task end-to-end inside the current repository.

User task:
${input.instruction}

Required workflow:
1. Read AGENTS.md and inspect the repository status. Preserve unrelated changes and never use destructive Git commands.
2. Run git pull --ff-only. If it cannot run safely, stop and report the exact blocker.
3. Create and switch to this branch: ${requestedBranch}.
4. Implement the requested change following the repository architecture and conventions.
5. Run the relevant tests and the repository build. Fix failures caused by the task and repeat validation until it passes or a concrete blocker remains.
6. ${delivery}
7. Finish with a concise summary containing the branch, changed files, tests/build results, commit, and push status.

Stay within this repository. Never expose secrets or modify unrelated files.`;
    const codexExecutable = process.platform === "win32" ? "codex.cmd" : "codex";
    await execute(codexExecutable, [
      "--ask-for-approval", "never",
      "--sandbox", "workspace-write",
      "--cd", projectRoot,
      "exec", "--json", agentInstruction,
    ]);
    branch = (await execute("git", ["branch", "--show-current"])).stdout.trim() || input.branchName || "HEAD";
    return { ok: true, data: { branch, logs } };
  } catch (error) {
    return { ok: false, error: { code: "CODING_TASK_FAILED", message: error instanceof Error ? error.message : "Coding task failed" }, data: { branch, logs } };
  }
}

export async function controlSmartHomeDevice(untrustedInput: unknown) {
  const parsed = controlSmartHomeDeviceSchema.safeParse(untrustedInput);
  if (!parsed.success) return { ok: false as const, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid Home Assistant command" } };
  const input = parsed.data;
  const baseUrl = process.env.HA_URL?.replace(/\/$/, "");
  const token = process.env.HA_TOKEN;
  if (!baseUrl || !token) return { ok: false as const, error: { code: "HA_NOT_CONFIGURED", message: "HA_URL and HA_TOKEN are required" } };
  try {
    const response = await fetch(`${baseUrl}/api/services/${input.domain}/${input.service}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...(input.payload ?? {}), entity_id: input.entityId }),
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false as const, error: { code: "HA_REQUEST_FAILED", message: `Home Assistant returned HTTP ${response.status}` }, data: responseBody };
    return { ok: true as const, data: responseBody };
  } catch (error) {
    return { ok: false as const, error: { code: "HA_REQUEST_FAILED", message: error instanceof Error ? error.message : "Home Assistant request failed" } };
  }
}
