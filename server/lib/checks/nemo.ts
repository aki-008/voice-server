import { runCommand } from "../runCommand.js";
import type { CheckResult } from "./types.js";

export async function checkNemo(): Promise<CheckResult> {
  const result = await runCommand("nemo-speech", ["--version"]);
  if (!result.ok) {
    return {
      pass: false,
      reason: "NeMo not installed",
      detail: result.stderr || result.error,
    };
  }
  return { pass: true, version: result.stdout.trim() };
}
