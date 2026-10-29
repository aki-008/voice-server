import { createApp } from "./app.js";
import { runStartupChecks } from "./lib/bootstrap.js";
import { patchConsole } from "./lib/logger.js";
import { stopSttServer } from "./lib/serverSetup.js";
import { setCachedChecks } from "./routes/api.js";

const PORT = Number(process.env.PORT) || 3000;

// Patch console first so every startup line reaches /api/logs.
patchConsole();

// Ctrl+C / Ctrl+Break must take the STT server down too. SIGTERM is left
// alone on purpose: `tsx watch` sends it on every file change, and the STT
// server is meant to outlive those restarts (reloading the model is slow).
for (const signal of ["SIGINT", "SIGBREAK"] as const) {
  process.on(signal, () => {
    stopSttServer();
    process.exit(0);
  });
}

createApp().listen(PORT, () => {
  console.log(`Express ready on :${PORT}`);

  runStartupChecks()
    .then(setCachedChecks)
    .catch((err) => console.error("Startup checks failed:", err));
});
