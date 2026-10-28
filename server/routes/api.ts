import { Router } from "express";

import { getLogs, onLog, type LogEntry } from "../lib/logger.js";
import { checkModel, checkNemo, checkServer } from "./sanityCheck.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/hello", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

router.get("/sanity_check", async (_req, res) => {
  const [nemo, model, server] = await Promise.all([
    checkNemo(),
    checkModel(),
    checkServer(),
  ]);
  res.json({ nemo, model, server });
});

// Live backend logs over Server-Sent Events.
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

  // Replay history so a fresh page shows startup logs.
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
