import fs from "node:fs";

import { MODEL_FILE } from "../paths.js";
import type { CheckResult } from "./types.js";

/** Any weight file under this many bytes is a truncated write. */
const MIN_BYTES = 10 * 1024 * 1024;

export async function checkModel(): Promise<CheckResult> {
  try {
    const stat = await fs.promises.stat(MODEL_FILE);
    if (!stat.isFile()) {
      return { pass: false, reason: "Model path is not a file" };
    }
    if (stat.size < MIN_BYTES) {
      return { pass: false, reason: `Model truncated (${stat.size} bytes)` };
    }
    return { pass: true, fileCount: 1 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { pass: false, reason: `Model file missing (${MODEL_FILE})` };
    }
    return { pass: false, reason: e.message };
  }
}
