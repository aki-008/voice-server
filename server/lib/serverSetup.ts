import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { checkHfCli, locateHf, waitForServer } from "./checks/index.js";
import {
  MODEL_FILE,
  MODEL_FILE_NAME,
  MODEL_REPO,
  MODELS_DIR,
  NEMO_BIN_DIR,
  NEMO_DIR,
  REPO_ROOT,
} from "./paths.js";
import { isWindows, prependToPath, WINDOWS_POWERSHELL } from "./platform.js";
import { createProgress, trackProgress } from "./progress.js";
import { runCommand } from "./runCommand.js";

const NEMO_INSTALLER_BASE =
  "https://raw.githubusercontent.com/NVIDIA/NeMo-Speech.cpp/main/scripts";
const HF_INSTALLER_URL = "https://hf.co/cli/install.sh";

const NEMO_SCRIPT = path.join(
  os.tmpdir(),
  isWindows ? "nemo-speech-install.ps1" : "nemo-speech-install.sh",
);
const HF_SCRIPT = path.join(
  os.tmpdir(),
  isWindows ? "hf-install.ps1" : "hf-install.sh",
);

const DOWNLOAD_TIMEOUT = 2 * 60 * 1000;
const INSTALL_TIMEOUT = 30 * 60 * 1000;
const SERVER_START_TIMEOUT = 3 * 60 * 1000;

/**
 * Browser origins allowed to call the STT server. The browser talks to it
 * directly (it is a different origin from the app), and NeMo rejects
 * cross-origin requests unless this is set. Override with STT_CORS_ORIGIN when
 * one specific origin should be allowed instead of the public default.
 */
const STT_CORS_ORIGIN = process.env.STT_CORS_ORIGIN?.trim() || "*";

/** The STT server we spawned, so shutdown can take it down. */
let sttProcess: ChildProcess | null = null;

async function download(url: string, dest: string): Promise<boolean> {
  const result = await runCommand(
    isWindows ? "curl.exe" : "curl",
    ["-fsSL", "-o", dest, url],
    DOWNLOAD_TIMEOUT,
  );
  if (!result.ok) {
    console.error(result.stderr || result.error);
    return false;
  }
  return true;
}

function runNemoInstaller() {
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
        NEMO_SCRIPT,
        "-Prefix",
        NEMO_DIR,
        "-NoModifyPath",
      ],
      INSTALL_TIMEOUT,
      env,
    );
  }

  return runCommand(
    "sh",
    [NEMO_SCRIPT, "--prefix", NEMO_DIR, "--no-modify-path"],
    INSTALL_TIMEOUT,
  );
}

/** Download and run the NeMo Speech installer. Callers verify with `checkNemo()`. */
export async function installNemo(): Promise<boolean> {
  const progress = createProgress("NeMo setup");
  const installer = `${NEMO_INSTALLER_BASE}/${isWindows ? "install.ps1" : "install.sh"}`;

  const downloaded = await trackProgress(
    progress,
    0.02,
    0.12,
    download(installer, NEMO_SCRIPT),
    "downloading installer",
  );
  if (!downloaded) {
    progress.stop("✗ Failed to download installer");
    return false;
  }

  const install = await trackProgress(
    progress,
    0.12,
    0.95,
    runNemoInstaller(),
    "installing (this can take several minutes)",
  );
  if (!install.ok) {
    progress.stop("✗ Installation failed");
    console.error(install.stderr || install.error);
    return false;
  }

  // Make the freshly installed CLI visible to this process.
  prependToPath(NEMO_BIN_DIR);
  progress.stop("NeMo installer finished");
  return true;
}

/** Windows installs through uv/pip, so there is no script to fetch. */
async function prepareHfInstaller(): Promise<boolean> {
  if (isWindows) return true;
  return download(HF_INSTALLER_URL, HF_SCRIPT);
}

async function runHfInstaller() {
  if (!isWindows) {
    return runCommand("bash", [HF_SCRIPT], INSTALL_TIMEOUT);
  }

  const uv = await runCommand(
    "uv",
    ["tool", "install", "-U", "huggingface_hub[cli]"],
    INSTALL_TIMEOUT,
  );
  if (uv.ok) return uv;

  return runCommand(
    "python",
    ["-m", "pip", "install", "-U", "huggingface_hub[cli]"],
    INSTALL_TIMEOUT,
  );
}

/** Install the Hugging Face CLI. Callers verify with `checkHfCli()`. */
export async function installHfCli(): Promise<boolean> {
  const progress = createProgress("hf CLI setup");

  const prepared = await trackProgress(
    progress,
    0.05,
    0.2,
    prepareHfInstaller(),
    isWindows ? "preparing installer" : "downloading installer",
  );
  if (!prepared) {
    progress.stop("✗ Failed to download installer");
    return false;
  }

  const install = await trackProgress(
    progress,
    0.2,
    0.9,
    runHfInstaller(),
    "installing (this can take a minute)",
  );
  if (!install.ok) {
    progress.stop("✗ Installation failed");
    console.error(install.stderr || install.error);
    return false;
  }

  // Put the installed binary on PATH so later spawns resolve it.
  const located = await locateHf();
  if (located && path.isAbsolute(located)) {
    prependToPath(path.dirname(located));
  }

  progress.stop("hf CLI installer finished");
  return true;
}

/** Download the ASR weights with `hf`. Callers verify with `checkModel()`. */
export async function installModel(): Promise<boolean> {
  const progress = createProgress("Model setup");

  const hf = await checkHfCli();
  if (!hf.pass) {
    progress.stop("✗ hf CLI not available — cannot download model");
    console.warn(hf.reason);
    return false;
  }

  const downloadResult = await trackProgress(
    progress,
    0.05,
    0.95,
    runCommand(
      "hf",
      ["download", MODEL_REPO, MODEL_FILE_NAME, "--local-dir", MODELS_DIR],
      INSTALL_TIMEOUT,
    ),
    "downloading model (this can take several minutes)",
  );
  if (!downloadResult.ok) {
    progress.stop("✗ Model download failed");
    console.error(downloadResult.stderr || downloadResult.error);
    return false;
  }

  progress.stop("Model download finished");
  return true;
}

/**
 * Spawn `nemo-speech serve` next to the app. Resolves once the process is up.
 *
 * Deliberately NOT detached: `detached: true` puts the child in a new Windows
 * process group, so Ctrl+C and closing the terminal never reach it and it
 * lingers after the app stops. Sharing the console/process group means the
 * shell's Ctrl+C (and console teardown) take it down with us.
 */
function launchSttServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      "nemo-speech",
      [
        "serve",
        "--asr-model",
        MODEL_FILE,
        "--cors-origin",
        STT_CORS_ORIGIN,
        "--open",
      ],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
    sttProcess = child;

    child.once("error", (err) => {
      console.error(err.message);
      if (sttProcess === child) sttProcess = null;
      resolve(false);
    });
    child.once("spawn", () => {
      child.unref(); // don't hold the event loop open on the child's account
      resolve(true);
    });
    child.once("exit", () => {
      if (sttProcess === child) sttProcess = null;
    });
  });
}

/** Stop the STT server started by this process, if it is still running. */
export function stopSttServer(): void {
  const child = sttProcess;
  sttProcess = null;

  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
}

/** Start the STT server and wait until it reports ready. */
export async function startSttServer(): Promise<boolean> {
  const progress = createProgress("STT server");

  const launched = await launchSttServer();
  if (!launched) {
    progress.stop("✗ Failed to launch server");
    return false;
  }

  const ready = await trackProgress(
    progress,
    0.1,
    0.95,
    waitForServer(SERVER_START_TIMEOUT),
    "waiting for server to become ready",
  );

  if (!ready.pass) {
    progress.stop("⚠ Server not ready yet");
    console.warn(ready.reason);
    return false;
  }

  progress.stop("STT server is ready");
  return true;
}
