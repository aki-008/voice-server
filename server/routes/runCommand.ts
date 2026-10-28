import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runCommand(
  cmd: string,
  args: string[] = [],
  timeout = 30_000,
) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB, enough for pip output
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { message: string; stdout?: string; stderr?: string };
    return {
      ok: false,
      error: e.message,
      stdout: e.stdout,
      stderr: e.stderr,
    };
  }
}
