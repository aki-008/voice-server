import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { patchConsole } from "./lib/logger.js";
import apiRouter from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const isDev = process.env.NODE_ENV !== "production";
  const app = express();

  app.use(express.json());
  app.use("/api", apiRouter);

  if (!isDev) {
    const clientDist = path.join(__dirname, "..", "dist");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}

// Console must be patched before any module logs at import time.
patchConsole();
