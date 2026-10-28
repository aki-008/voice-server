import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { runCommand } from "../runCommand.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CheckResult =
  | { pass: true; version?: string; fileCount?: number }
  | { pass: false; reason: string; detail?: string };

export async function checkNemo(): Promise<CheckResult> {
  const result = await runCommand("nemo-speech", ["--version"]);
  if (!result.ok) {
    return { pass: false, reason: "NeMo not installed", detail: result.stderr };
  }
  return { pass: true, version: (result.stdout ?? "").trim() };
}

const MODEL_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "models",
  "nemotron-speech-streaming-en-0.6b",
);

export async function checkModel(): Promise<CheckResult> {
  try {
    const stat = await fs.promises.stat(MODEL_DIR);
    if (!stat.isDirectory()) {
      return { pass: false, reason: "Model path is not a directory" };
    }
    const files = await fs.promises.readdir(MODEL_DIR);
    if (files.length === 0) {
      return { pass: false, reason: "Model directory is empty" };
    }
    return { pass: true, fileCount: files.length };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { pass: false, reason: "Model directory missing" };
    }
    return { pass: false, reason: e.message };
  }
}

const DEFAULT_STT_URL = process.env.STT_URL ?? "http://127.0.0.1:8080/ready";

export function checkServer(
  url: string = DEFAULT_STT_URL,
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      // Drain the response so the socket closes cleanly.
      res.resume();
      if (res.statusCode === 200) resolve({ pass: true });
      else resolve({ pass: false, reason: `HTTP ${res.statusCode}` });
    });
    req.on("error", (e) => resolve({ pass: false, reason: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ pass: false, reason: "timeout" });
    });
  });
}
