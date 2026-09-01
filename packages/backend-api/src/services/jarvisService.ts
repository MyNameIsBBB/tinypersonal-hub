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
  instruction: z.string().max(20_000).refine((value) => value.trim().length >= 3, "Instruction must contain at least 3 non-whitespace characters"),
  readOnly: z.boolean().default(false),
  branchName: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,119}$/).optional(),
  autoPush: z.boolean().default(false),
}).strict().superRefine(({ readOnly, autoPush, branchName }, context) => {
  if (autoPush && !branchName) context.addIssue({ code: z.ZodIssueCode.custom, path: ["branchName"], message: "branchName is required when autoPush is enabled" });
  if (readOnly && (autoPush || branchName)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["readOnly"], message: "readOnly tasks cannot create a branch or push" });
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

function finalCodexAgentMessage(stdout: string) {
  let message = "";
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) message = event.item.text.trim();
    } catch {}
  }
  return message;
}

export function classifyCodingInstructionReadOnly(instruction: string) {
  const explicitlyReadOnly = /(ห้าม(?:ทำการ)?(?:แก้ไข|เปลี่ยน|เขียน|ลบ)|ไม่(?:ต้อง|ให้)?(?:แก้ไข|เปลี่ยน|เขียน|ลบ)|อ่านอย่างเดียว|ดูอย่างเดียว|read[ -]?only|do not (?:modify|edit|write|change|delete)|without (?:modifying|editing|changing))/iu.test(instruction);
  const mutation = /(สร้าง|เขียน|เพิ่ม|แก้|เปลี่ยน|ลบ|ย้าย|commit|push|create|write|add|implement|fix|update|delete|remove|refactor)/iu.test(instruction);
  const inspection = /(ตรวจ|ดู|เห็นอะไร|สถานะ|สรุป|รายการ|โครงสร้าง|inspect|status|list|review|summari[sz]e|what.*visible)/iu.test(instruction);
  return explicitlyReadOnly || (inspection && !mutation);
}

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
  const input = {
    ...parsed.data,
    readOnly: parsed.data.readOnly || (!parsed.data.branchName && !parsed.data.autoPush && classifyCodingInstructionReadOnly(parsed.data.instruction)),
  };
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
    const requestedBranch = input.readOnly ? null : input.branchName ?? `codex/task-${Date.now()}`;
    if (input.readOnly) {
      branch = (await execute("git", ["branch", "--show-current"])).stdout.trim() || "HEAD";
    } else {
      const statusBefore = (await execute("git", ["status", "--porcelain"])).stdout.trim();
      if (statusBefore) throw new Error("Repository has uncommitted changes; refusing to mix them with a delegated task");
      await execute("git", ["switch", "-c", requestedBranch!]);
      branch = requestedBranch;
    }
    const workflow = input.readOnly
      ? "Inspect the current workspace exactly as it is. Do not pull, switch or create branches, edit files, commit, or push. Run only read-only commands and summarize the evidence you observe."
      : `The worker has already pulled and switched to branch ${requestedBranch}; do not create, switch, commit, or push Git branches. Implement the requested change, run relevant tests/builds, and leave changes in the working tree for worker verification.`;
    const agentInstruction = `Own this coding task end-to-end inside the current repository.

User task:
${input.instruction}

Required workflow:
1. Read AGENTS.md and inspect the repository status. Preserve unrelated changes and never use destructive Git commands.
2. ${workflow}
3. Finish with a concise evidence-based summary.

Stay within this repository. Never expose secrets or modify unrelated files.`;
    const codexExecutable = process.platform === "win32" ? "codex.cmd" : "codex";
    const codexLog = await execute(codexExecutable, [
      "--ask-for-approval", "never",
      "--sandbox", input.readOnly ? "read-only" : "workspace-write",
      "--cd", projectRoot,
      "exec", "--json", agentInstruction,
    ]);
    if (!finalCodexAgentMessage(codexLog.stdout)) throw new Error("Codex exited without a final agent message");
    branch = (await execute("git", ["branch", "--show-current"])).stdout.trim() || "HEAD";
    if (!input.readOnly && branch !== requestedBranch) throw new Error(`Expected branch ${requestedBranch}, but current branch is ${branch}`);
    const statusAfter = (await execute("git", ["status", "--porcelain"])).stdout.trim();
    if (!input.readOnly && !statusAfter) throw new Error("Codex exited successfully but produced no file changes");
    if (!input.readOnly && input.autoPush) {
      await execute("git", ["add", "--all"]);
      await execute("git", ["commit", "-m", "chore(codex): complete delegated task"]);
      await execute("git", ["push", "--set-upstream", "origin", requestedBranch!]);
    }
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
