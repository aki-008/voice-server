export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  message: string;
}

const MAX_BUFFER = 500;

const buffer: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

let nextId = 1;
let patched = false;

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}

function format(args: unknown[]): string {
  return args.map(formatArg).join(' ');
}

/** Record a line and push it to every SSE subscriber. */
export function emit(level: LogLevel, args: unknown[]): void {
  const entry: LogEntry = {
    id: nextId++,
    time: new Date().toISOString(),
    level,
    message: format(args),
  };

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // A broken listener must not break logging.
    }
  }
}

/** Snapshot of buffered lines, so new clients see startup logs. */
export function getLogs(): LogEntry[] {
  return buffer.slice();
}

export function onLog(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mirror console.* output into the log stream (and keep printing it). */
export function patchConsole(): void {
  if (patched) return;
  patched = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  (Object.keys(original) as LogLevel[]).forEach((level) => {
    const write = original[level];
    console[level] = (...args: unknown[]) => {
      write(...args);
      emit(level, args);
    };
  });
}
