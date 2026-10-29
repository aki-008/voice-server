import {
  checkHfCli,
  checkModel,
  checkNemo,
  checkServer,
  type CheckResult,
  type SanityReport,
} from "./checks/index.js";
import {
  installHfCli,
  installModel,
  installNemo,
  startSttServer,
} from "./serverSetup.js";

function describe(result: CheckResult): string {
  if (!result.pass) return result.reason;
  if (result.version) return result.version;
  if (result.fileCount !== undefined) return `${result.fileCount} file(s)`;
  return "ready";
}

/**
 * Check once; if the dependency is missing, run its installer and re-check.
 * The final result is what gets cached for `/api/sanity_check`.
 */
async function ensure(
  label: string,
  check: () => Promise<CheckResult>,
  fix: () => Promise<unknown>,
): Promise<CheckResult> {
  const initial = await check();
  if (initial.pass) {
    console.log(`✓ ${label}: ${describe(initial)}`);
    return initial;
  }

  console.warn(`⚠ ${label}: ${initial.reason}`);
  await fix();

  const final = await check();
  if (final.pass) console.log(`✓ ${label}: ${describe(final)}`);
  else console.warn(`⚠ ${label} unavailable: ${final.reason}`);
  return final;
}

/** Read-only snapshot used by `/api/sanity_check?refresh=1`. */
export async function runSanityChecks(): Promise<SanityReport> {
  const [nemo, model, server] = await Promise.all([
    checkNemo(),
    checkModel(),
    checkServer(),
  ]);
  return { nemo, model, server };
}

/** Boot sequence: install whatever is missing, then report the final state. */
export async function runStartupChecks(): Promise<SanityReport> {
  console.log("Running sanity checks...");

  const nemo = await ensure("NeMo", checkNemo, installNemo);
  await ensure("hf CLI", checkHfCli, installHfCli);
  const model = await ensure("Model", checkModel, installModel);
  const server = await ensure("STT server", checkServer, startSttServer);

  return { nemo, model, server };
}
