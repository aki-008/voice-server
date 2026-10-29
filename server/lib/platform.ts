import path from "node:path";

export const isWindows = process.platform === "win32";

export const WINDOWS_POWERSHELL = path.join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

/** Make a directory visible to this process (idempotent). */
export function prependToPath(dir: string): void {
  const parts = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  if (parts.includes(dir)) return;
  process.env.PATH = [dir, ...parts].join(path.delimiter);
}
