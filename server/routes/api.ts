import { Router } from "express";

import { getLogs, onLog, type LogEntry } from "../lib/logger.js";
import { checkModel, checkNemo, checkServer } from "../lib/checks/index.js";
import type { CheckResult } from "../lib/checks/sanityCheck.js";

const router = Router();

/** Latest sanity-check result, cached after boot and refreshed on demand. */
let cachedChecks: {
  nemo: CheckResult;
  model: CheckResult;
  server: CheckResult;
} | null = null;

export function setCachedChecks(value: typeof cachedChecks): void {
  cachedChecks = value;
}

async function runAllChecks() {
  const [nemo, model, server] = await Promise.all([
    checkNemo(),
    checkModel(),
    checkServer(),
  ]);
  return { nemo, model, server };
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/hello", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

router.get("/sanity_check", async (req, res) => {
  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  if (!cachedChecks || refresh) {
    cachedChecks = await runAllChecks();
  }
  res.json(cachedChecks);
});

router.get("/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (entry: LogEntry) => {
    res.write(`id: ${entry.id}\n`);
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  for (const entry of getLogs()) send(entry);

  const unsubscribe = onLog(send);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
