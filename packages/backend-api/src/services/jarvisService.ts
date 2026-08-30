import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 200_000;
const COMMAND_TIMEOUT_MS = 10 * 60_000;

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

export async function delegateCodingTask(untrustedInput: unknown): Promise<CodingTaskResult> {
  const parsed = delegateCodingTaskSchema.safeParse(untrustedInput);
  if (!parsed.success) return { ok: false, error: { code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid coding task" }, data: { branch: null, logs: [] } };
  const input = parsed.data;
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
    await execute("git", ["pull", "--ff-only"]);
    if (input.branchName) await execute("git", ["switch", "-c", input.branchName]);
    branch = (await execute("git", ["branch", "--show-current"])).stdout.trim() || input.branchName || "HEAD";
    const codingCli = process.env.JARVIS_CODING_CLI ?? "codex";
    if (codingCli === "aider") await execute("aider", ["--message", input.instruction, "--yes-always"]);
    else if (codingCli === "codex") await execute("codex", ["exec", input.instruction, "--full-auto"]);
    else throw new Error("JARVIS_CODING_CLI must be either codex or aider");
    await execute(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
    if (input.autoPush) {
      await execute("git", ["add", "--all"]);
      await execute("git", ["commit", "-m", `chore(jarvis): ${input.instruction.slice(0, 72)}`]);
      await execute("git", ["push", "--set-upstream", "origin", branch]);
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
