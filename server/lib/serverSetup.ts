import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProgress, trackProgress } from "./progress.js";
import { checkNemo } from "./checks/sanityCheck.ts";
import { runCommand } from "./runCommand.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isWindows = process.platform === "win32";

const PREFIX = path.resolve(__dirname, "..", "..", "vendor", "NeMoSpeech");
const BIN = path.join(PREFIX, "bin");
const INSTALLER_BASE =
  "https://raw.githubusercontent.com/NVIDIA/NeMo-Speech.cpp/main/scripts";
const SCRIPT = path.join(
  os.tmpdir(),
  isWindows ? "nemo-speech-install.ps1" : "nemo-speech-install.sh",
);

const WINDOWS_POWERSHELL = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

async function downloadInstaller(): Promise<boolean> {
  const url = `${INSTALLER_BASE}/${isWindows ? "install.ps1" : "install.sh"}`;

  const result = await runCommand(
    isWindows ? "curl.exe" : "curl",
    ["-fsSL", "-o", SCRIPT, url],
    2 * 60 * 1000,
  );

  if (!result.ok) {
    console.error(result.stderr || result.error);
    return false;
  }
  return true;
}

function runInstaller() {
  if (isWindows) {
    const env = { ...process.env };
    delete env.PSModulePath;

    return runCommand(
      WINDOWS_POWERSHELL,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        SCRIPT,
        "-Prefix",
        PREFIX,
        "-NoModifyPath",
      ],
      30 * 60 * 1000,
      env,
    );
  }

  return runCommand(
    "sh",
    [SCRIPT, "--prefix", PREFIX, "--no-modify-path"],
    30 * 60 * 1000,
  );
}

/**
 * Install NeMo Speech and return the resulting PATH prefix, or `null` on
 * failure. Does NOT mutate `process.env` — the caller decides how to apply it.
 */
export async function getNemo(): Promise<string | null> {
  const progress = createProgress("NeMo setup");

  progress.set(0.02, "downloading installer");
  const downloaded = await trackProgress(
    progress,
    0.02,
    0.12,
    downloadInstaller(),
    "downloading installer",
  );

  if (!downloaded) {
    progress.stop("✗ Failed to download installer");
    return null;
  }

  progress.set(0.12, "installing (this can take several minutes)");
  const install = await trackProgress(
    progress,
    0.12,
    0.95,
    runInstaller(),
    "installing (this can take several minutes)",
  );

  if (!install.ok) {
    progress.stop("✗ Installation failed");
    console.error(install.stderr || install.error);
    return null;
  }

  // Make the freshly installed CLI visible to this process.
  const current = process.env.PATH ?? "";
  const newPath = current ? `${BIN}${path.delimiter}${current}` : BIN;
  process.env.PATH = newPath;

  progress.set(0.97, "verifying");
  const result = await checkNemo();
  progress.stop(
    result.pass ? "✓ NeMo installed" : "⚠ NeMo installed but not detected",
  );
  if (!result.pass) console.warn(result.reason);

  return BIN;
}
