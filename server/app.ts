import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { patchConsole } from "./lib/logger.js";
import apiRouter from "./routes/api.js";
import { checkModel, checkNemo, checkServer } from "./routes/sanityCheck.js";
import { getNemo } from "./routes/serverSetup.js";

patchConsole();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== "production";
const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.use(express.json());
app.use("/api", apiRouter);

// Serve the built SPA in production.
if (!isDev) {
  const clientDist = path.join(__dirname, "..", "dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function runChecks() {
  console.log("Running sanity checks...");

  const nemo = await checkNemo();
  if (!nemo.pass) {
    console.warn("⚠ NeMo:", nemo.reason);
    await getNemo();
  } else {
    console.log("✓ NeMo", nemo.version);
  }

  const model = await checkModel();
  if (!model.pass) {
    console.warn("⚠ Model:", model.reason);
  } else {
    console.log("✓ Model available");
  }

  const stt = await checkServer();
  if (!stt.pass) {
    console.warn("⚠ STT server:", stt.reason);
  } else {
    console.log("✓ STT server reachable");
  }
}

app.listen(PORT, () => {
  console.log(`Express ready on :${PORT}`);
  // Run setup after listening so logs (incl. install progress) reach the SPA.
  runChecks().catch((err) => console.error("Startup checks failed:", err));
});
