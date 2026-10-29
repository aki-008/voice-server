import http from "node:http";

import { STT_URL } from "../config.js";
import type { CheckResult } from "./types.js";

const TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 1_000;

export function checkServer(url: string = STT_URL): Promise<CheckResult> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
      res.resume();
      resolve(
        res.statusCode === 200
          ? { pass: true }
          : { pass: false, reason: `HTTP ${res.statusCode}` },
      );
    });
    req.on("error", (e) => resolve({ pass: false, reason: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ pass: false, reason: "timeout" });
    });
  });
}

/** Poll `/ready` until the STT server answers or the deadline passes. */
export async function waitForServer(
  timeoutMs: number,
  url?: string,
): Promise<CheckResult> {
  const deadline = Date.now() + timeoutMs;
  let last: CheckResult = { pass: false, reason: "never started" };

  while (Date.now() < deadline) {
    last = await checkServer(url);
    if (last.pass) return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return last;
}
