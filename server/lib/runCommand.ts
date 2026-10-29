import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024; // 64MB, for verbose installer/build output

export type CommandResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; error: string; stdout: string; stderr: string };

function toText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : String(value);
}

export async function runCommand(
  cmd: string,
  args: string[] = [],
  timeout = 30_000,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout,
      maxBuffer: MAX_BUFFER,
      ...(env ? { env } : {}),
    });
    return { ok: true, stdout: toText(stdout), stderr: toText(stderr) };
  } catch (err) {
    const e = err as { message: string; stdout?: unknown; stderr?: unknown };
    return {
      ok: false,
      error: e.message,
      stdout: toText(e.stdout),
      stderr: toText(e.stderr),
    };
  }
}
