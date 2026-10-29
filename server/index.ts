import { createApp } from "./app.js";
import { runStartupChecks } from "./lib/bootstrap.js";
import { APP_PORT } from "./lib/config.js";
import { patchConsole } from "./lib/logger.js";
import { startTunnels, stopTunnels } from "./lib/ngrok_tunnel.js";
import { stopSttServer } from "./lib/serverSetup.js";
import { setCachedChecks } from "./routes/api.js";

// Patch console first so every startup line reaches /api/logs.
patchConsole();

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  stopSttServer();
  await stopTunnels();
  process.exit(0);
}

// Ctrl+C / Ctrl+Break must take the STT server and the tunnel down too. SIGTERM
// is left alone on purpose: `tsx watch` sends it on every file change, and the
// STT server is meant to outlive those restarts (reloading the model is slow).
for (const signal of ["SIGINT", "SIGBREAK"] as const) {
  process.on(signal, () => void shutdown());
}

createApp().listen(APP_PORT, () => {
  console.log(`Express ready on :${APP_PORT}`);

  runStartupChecks()
    .then(async (report) => {
      setCachedChecks(report);
      await startTunnels(); // no-op unless NGROK_AUTHTOKEN is set
    })
    .catch((err) => console.error("Startup checks failed:", err));
});
