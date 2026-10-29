import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isWindows } from "../platform.js";
import { runCommand } from "../runCommand.js";
import type { CheckResult } from "./types.js";

const EXE_NAMES = isWindows ? ["hf.exe", "hf.cmd", "hf.bat"] : ["hf"];

const KNOWN_DIRS = isWindows
  ? [
      path.join(os.homedir(), ".local", "bin"), // standalone installer
      path.join(os.homedir(), ".hf-cli"), // legacy shim
      path.join(process.env.APPDATA ?? "", "Python", "Scripts"), // pip (python.org)
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Python", "Scripts"),
    ]
  : [
      path.join(os.homedir(), ".local", "bin"), // install.sh default
      path.join(os.homedir(), ".hf-cli"),
      "/usr/local/bin",
      "/usr/bin",
    ];

export async function checkHfCli(): Promise<CheckResult> {
  const located = await locateHf();
  if (!located) {
    return {
      pass: false,
      reason: "hf CLI not found",
      detail: "not on PATH or in known install dirs",
    };
  }

  const result = await runCommand(located, ["version"]);
  if (!result.ok) {
    return { pass: false, reason: "hf CLI not runnable", detail: result.stderr };
  }
  return { pass: true, version: result.stdout.trim(), location: located };
}

/** Absolute path to the `hf` executable, or `null` when it isn't installed. */
export async function locateHf(): Promise<string | null> {
  const finder = isWindows ? "where.exe" : "which";
  const found = await runCommand(finder, ["hf"]);
  if (found.ok) {
    const first = found.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return first;
  }

  for (const dir of KNOWN_DIRS) {
    if (!dir) continue;
    for (const name of EXE_NAMES) {
      const exe = path.join(dir, name);
      try {
        await fs.promises.access(exe, fs.constants.F_OK);
        return exe;
      } catch {
        // keep looking
      }
    }
  }

  return null;
}
