// server/index.ts — full rewrite

import { createApp } from "./app.js";
import { checkModel, checkNemo, checkServer } from "./lib/checks/index.js";
import type { CheckResult } from "./lib/checks/sanityCheck.js";
import {
  getNemo,
  getHFCli,
  checkHfCli,
  getModel,
  RunServer,
} from "./lib/serverSetup.js";
import { setCachedChecks } from "./routes/api.js";

const PORT = Number(process.env.PORT) || 3000;

async function runChecks(): Promise<{
  nemo: CheckResult;
  model: CheckResult;
  server: CheckResult;
}> {
  console.log("Running sanity checks...");

  // --- NeMo ---
  let nemo = await checkNemo();
  if (nemo.pass) {
    console.log("✓ NeMo", nemo.version);
  } else {
    console.warn("⚠ NeMo:", nemo.reason);
    await getNemo();
    nemo = await checkNemo(); // re-check *once* after install, so cache is accurate
    if (nemo.pass) console.log("✓ NeMo", nemo.version);
    else console.warn("⚠ NeMo setup failed — continuing without it");
  }

  // --- hf CLI ---
  const hf = await checkHfCli();
  if (hf.pass) {
    console.log("✓ hf", hf.version);
  } else {
    console.warn("⚠ hf:", hf.reason);
    await getHFCli();
  }

  // --- Model ---
  let model = await checkModel();
  if (model.pass) {
    console.log("✓ Model available");
  } else {
    console.warn("⚠ Model:", model.reason);
    await getModel();
    model = await checkModel(); // re-check once, now that download ran
    if (model.pass) console.log("✓ Model available");
    else console.warn("⚠ Model download incomplete");
  }

  // --- STT server ---
  const server = await checkServer();
  if (server.pass) {
    console.log("✓ server availiable");
  } else {
    console.warn("⚠ server not responding:", server.reason);
    await RunServer();
  }
  return { nemo, model, server };
}

createApp().listen(PORT, () => {
  console.log(`Express ready on :${PORT}`);
  runChecks()
    .then((results) => setCachedChecks(results))
    .catch((err) => console.error("Startup checks failed:", err));
});
