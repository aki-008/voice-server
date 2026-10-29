import { createApp } from "./app.js";
import { runStartupChecks } from "./lib/bootstrap.js";
import { patchConsole } from "./lib/logger.js";
import { setCachedChecks } from "./routes/api.js";

const PORT = Number(process.env.PORT) || 3000;

// Patch console first so every startup line reaches /api/logs.
patchConsole();

createApp().listen(PORT, () => {
  console.log(`Express ready on :${PORT}`);

  runStartupChecks()
    .then(setCachedChecks)
    .catch((err) => console.error("Startup checks failed:", err));
});
