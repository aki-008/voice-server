import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProgress, trackProgress } from "../lib/progress.js";
import { checkNemo } from "./sanityCheck.js";
import { runCommand } from "./runCommand.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PREFIX = path.resolve(__dirname, "..", "..", "vendor", "NeMoSpeech");
const BIN = path.join(PREFIX, "bin");

export async function getNemo() {
  const progress = createProgress("NeMo setup");
  const script = path.join(os.tmpdir(), "nemo-speech-install.ps1");

  progress.set(0.02, "downloading installer");
  const download = await trackProgress(
    progress,
    0.02,
    0.12,
    runCommand(
      "curl.exe",
      [
        "-fsSL",
        "-o", script,
        "https://raw.githubusercontent.com/NVIDIA/NeMo-Speech.cpp/main/scripts/install.ps1",
      ],
      2 * 60 * 1000,
    ),
    "downloading installer",
  );

  if (!download.ok) {
    progress.stop("✗ Failed to download installer");
    console.error(download.stderr || download.error);
    return;
  }

  progress.set(0.12, "installing (this can take several minutes)");
  const install = await trackProgress(
    progress,
    0.12,
    0.95,
    runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", script,
        "-Prefix", PREFIX,
        "-NoModifyPath",
      ],
      30 * 60 * 1000,
    ),
    "installing (this can take several minutes)",
  );

  if (!install.ok) {
    progress.stop("✗ Installation failed");
    console.error(install.stderr || install.error);
    return;
  }

  // Make the freshly installed CLI visible to this process.
  process.env.PATH = `${BIN};${process.env.PATH ?? ""}`;

  progress.set(0.97, "verifying");
  const result = await checkNemo();
  progress.stop(
    result.pass ? "✓ NeMo installed" : "⚠ NeMo installed but not detected",
  );
  if (!result.pass) console.warn(result.reason);
}
