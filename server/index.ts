import { createApp } from "./app.js";
import { checkModel, checkNemo, checkServer } from "./lib/checks/index.js";
import { getNemo } from "./lib/serverSetup.js";
import { setCachedChecks } from "./routes/api.js";

const PORT = Number(process.env.PORT) || 3000;

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
  if (!model.pass) console.warn("⚠ Model:", model.reason);
  else console.log("✓ Model available");

  const stt = await checkServer();
  if (!stt.pass) console.warn("⚠ STT server:", stt.reason);
  else console.log("✓ STT server reachable");

  // Publish results so `/api/sanity_check` doesn't re-run on first hit.
  const [nemo2, model2, stt2] = await Promise.all([
    checkNemo(),
    checkModel(),
    checkServer(),
  ]);
  setCachedChecks({ nemo: nemo2, model: model2, server: stt2 });
}

createApp().listen(PORT, () => {
  console.log(`Express ready on :${PORT}`);
  runChecks().catch((err) => console.error("Startup checks failed:", err));
});
