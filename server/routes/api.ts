import { Router } from "express";

import { runSanityChecks } from "../lib/bootstrap.js";
import type { SanityReport } from "../lib/checks/index.js";
import { getLogs, onLog, type LogEntry } from "../lib/logger.js";
import { getTunnels } from "../lib/ngrok_tunnel.js";

const router = Router();

const HEARTBEAT_MS = 15_000;

/** Latest sanity-check result, cached after boot and refreshed on demand. */
let cachedChecks: SanityReport | null = null;

export function setCachedChecks(report: SanityReport): void {
  cachedChecks = report;
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/** Public ngrok URLs, empty unless NGROK_AUTHTOKEN was set at startup. */
router.get("/tunnel", (_req, res) => {
  res.json({ tunnels: getTunnels() });
});

router.get("/sanity_check", async (req, res) => {
  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  if (refresh || !cachedChecks) {
    cachedChecks = await runSanityChecks();
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
  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
