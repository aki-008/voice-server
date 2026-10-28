import os, { version } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProgress, trackProgress } from "./progress.js";
import { checkNemo } from "./checks/sanityCheck.ts";
import { runCommand } from "./runCommand.js";
import fs from "node:fs";
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
  console.log(result, BIN);

  return BIN;
}

const HF_INSTALL_SH = "https://hf.co/cli/install.sh";
const HF_INSTALL_PS1 = "https://hf.co/cli/install.ps1";

const HF_SCRIPT = path.join(
  os.tmpdir(),
  isWindows ? "hf-instal.ps1" : "hf-install.sh",
);

export async function checkHfCli() {
  const result = await runCommand("hf", ["version"]);
  const located = await locateHf();
  if (!result.ok) {
    return {
      pass: false as const,
      reason: "hf cli not on PATH",
      detail: result.stderr,
    };
  }
  return {
    pass: true as const,
    version: (result.stdout ?? "").trim(),
    location: located,
  };
}

async function downloadHfInstaller(): Promise<boolean> {
  // On Windows prefer pip (documented, reliable). Only try the .ps1 mirror
  // if you've confirmed it exists — otherwise skip straight to pip.
  if (isWindows) return true;

  const result = await runCommand(
    "curl",
    ["-LsSf", "-o", HF_SCRIPT, HF_INSTALL_SH],
    2 * 60 * 1000,
  );
  if (!result.ok) {
    console.error(result.stderr || result.error);
    return false;
  }
  return true;
}

async function runHFInstaller() {
  if (isWindows) {
    const uv = await runCommand(
      "uv",
      ["tool", "install", "-U", "huggingface_hub[cli]"],
      10 * 60 * 1000,
    );
    console.log("uv installation");
    if (uv.ok) return uv;

    const py = await runCommand(
      "python",
      ["-m", "pip", "install", "-U", "huggingface_hub[cli]"],
      10 * 60 * 1000,
    );
    console.log("py installation");
    if (py.ok) return py;
    return py;
  }
  return runCommand("bash", [HF_SCRIPT], 10 * 60 * 1000);
}

async function locateHf(): Promise<string | null> {
  // 1) Already resolvable through PATH?
  // const direct = await runCommand("hf", ["version"]);
  // if (direct.ok) return "hf";

  // 2) Ask the OS where it is.
  const finder = isWindows ? "where.exe" : "which";
  const found = await runCommand(finder, ["hf"]);
  if (found.ok) {
    const first = (found.stdout ?? "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    if (first) return first;
  }

  // 3) Probe known install dirs.
  const candidates = isWindows
    ? [
        path.join(os.homedir(), ".local", "bin"), // standalone installer (your case)
        path.join(os.homedir(), ".hf-cli"), // legacy shim
        path.join(process.env.APPDATA ?? "", "Python", "Scripts"), // pip (python.org)
        path.join(
          process.env.LOCALAPPDATA ?? "",
          "Programs",
          "Python",
          "Scripts",
        ),
      ]
    : [
        path.join(os.homedir(), ".local", "bin"), // install.sh default
        path.join(os.homedir(), ".hf-cli"),
        "/usr/local/bin",
        "/usr/bin",
      ];

  const exeNames = isWindows ? ["hf.exe", "hf.cmd", "hf.bat"] : ["hf"];

  for (const dir of candidates) {
    if (!dir) continue;
    for (const name of exeNames) {
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

export async function getHFCli(): Promise<boolean> {
  const progress = createProgress("HF CLI setup");

  const already = await checkHfCli();
  if (already.pass) {
    progress.stop(
      `✓ hf already installed (${already.version}), (${already.location})`,
    );
    return true;
  }

  progress.set(0.05, "Downloading installer");
  const downloaded = await trackProgress(
    progress,
    0.05,
    0.2,
    downloadHfInstaller(),
    "downloading installer",
  );
  if (!downloaded) {
    progress.stop("✗ Failed to download hf installer");
    return false;
  }

  progress.set(0.2, "installing (this can take a minute)");
  const install = await trackProgress(
    progress,
    0.2,
    0.95,
    runHFInstaller(),
    "installing (this can take a minute)",
  );
  if (!install.ok) {
    progress.stop("✗ hf installation failed");
    // FIX: `install.error` is the execFile failure message; `.stderr` may be empty.
    console.error(install.stderr || install.error);
    return false;
  }

  // FIX: probe for the real binary instead of guessing a single dir.
  progress.set(0.95, "locating hf");
  const located = await locateHf();

  if (located && located !== "hf") {
    // Found by absolute path — prepend its dir to PATH so future spawns
    // (and checkHfCli below) resolve cleanly.
    const dir = path.dirname(located);
    const parts = (process.env.PATH ?? "").split(path.delimiter);
    if (!parts.includes(dir)) {
      process.env.PATH = [dir, ...parts].filter(Boolean).join(path.delimiter);
    }
  }

  progress.set(0.97, "verifying");
  const verified = await checkHfCli();
  progress.stop(
    verified.pass
      ? `✓ hf CLI installed${located && located !== "hf" ? ` (${located})` : ""}`
      : "⚠ hf installed but not detected",
  );

  if (!verified.pass) {
    console.warn(verified.reason);
    if (!located) {
      console.warn(
        "Searched dirs:",
        isWindows
          ? "%USERPROFILE%\\.local\\bin, ~\\.hf-cli, %APPDATA%\\Python\\Scripts, %LOCALAPPDATA%\\Programs\\Python\\Scripts"
          : "~/.local/bin, ~/.hf-cli, /usr/local/bin, /usr/bin",
      );
    }
  }

  return verified.pass;
}
