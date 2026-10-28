import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckResult } from "./nemo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the actual weight file (must match what getModel downloads). */
const MODEL_FILE = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "models",
  "nemotron-3.5-asr-streaming-0.6b.q8_0.gguf",
);

/** Any weight file under this many bytes is a truncated write. */
const MIN_BYTES = 10 * 1024 * 1024;

export async function checkModel(): Promise<CheckResult> {
  try {
    const stat = await fs.promises.stat(MODEL_FILE);
    if (!stat.isFile()) {
      return { pass: false, reason: "Model path is not a file" };
    }
    if (stat.size < MIN_BYTES) {
      return {
        pass: false,
        reason: `Model truncated (${stat.size} bytes)`,
      };
    }
    return { pass: true, fileCount: 1 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { pass: false, reason: "Model file missing" };
    }
    return { pass: false, reason: e.message };
  }
}
