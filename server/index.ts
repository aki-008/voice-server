import { createApp } from "./app.js";
import { checkModel, checkNemo, checkServer } from "./lib/checks/index.js";
import { getNemo, getHFCli, checkHfCli, getModel } from "./lib/serverSetup.js";
import { setCachedChecks } from "./routes/api.js";

const PORT = Number(process.env.PORT) || 3000;

async function runChecks() {
  console.log("Running sanity checks...");

  // --- NeMo ---
  const nemo = await checkNemo();
  if (nemo.pass) {
    console.log("✓ NeMo", nemo.version);
  } else {
    console.warn("⚠ NeMo:", nemo.reason);
    const installed = await getNemo(); // ← returns BIN or null
    if (!installed) {
      console.warn("⚠ NeMo setup failed — continuing without it");
    }
    // Do NOT call checkNemo() again. getNemo() already verified.
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
  const model = await checkModel();
  if (model.pass) {
    console.log("✓ Model available");
  } else {
    console.warn("⚠ Model:", model.reason);
    await getModel();
  }

  // --- STT server (separate process; expected to fail here) ---
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
