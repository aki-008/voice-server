export type CheckResult =
  | { pass: true; version?: string; fileCount?: number; location?: string }
  | { pass: false; reason: string; detail?: string };

/** Snapshot of the three things the app needs before it can serve STT. */
export interface SanityReport {
  nemo: CheckResult;
  model: CheckResult;
  server: CheckResult;
}
