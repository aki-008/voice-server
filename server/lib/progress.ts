import readline from 'node:readline';

import { emit } from './logger.js';

const WIDTH = 24;

export interface Progress {
  readonly interactive: boolean;
  set(fraction: number, label?: string): void;
  stop(message?: string): void;
}

export function createProgress(title: string): Progress {
  const interactive = Boolean(process.stdout.isTTY);
  let value = 0;
  let lastLabel: string | undefined;

  function render(label?: string) {
    const safe = Math.max(0, Math.min(1, value));
    const filled = Math.round(safe * WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(WIDTH - filled);
    const pct = `${Math.round(safe * 100)}%`.padStart(4);
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(`${title} [${bar}] ${pct} ${label ?? ''}`);
  }

  if (interactive) render();

  function announce(label?: string) {
    if (!label || label === lastLabel) return;
    lastLabel = label;
    if (interactive) {
      // The bar is drawn directly, so mirror the step to the log stream only.
      emit('info', [`${title}: ${label}`]);
    } else {
      // console is patched, so this also reaches the log stream.
      console.log(`${title}: ${label}`);
    }
  }

  return {
    interactive,
    set(fraction, label) {
      value = fraction;
      announce(label);
      if (interactive) render(label);
    },
    stop(message) {
      if (interactive) {
        value = 1;
        render('');
        process.stdout.write('\n');
      }
      if (message) console.log(message);
    },
  };
}

/**
 * Ease the bar from `from` toward `to` while `task` runs, then stop animating.
 * Child processes can't report real progress, so this keeps the bar moving
 * without ever claiming completion early.
 */
export async function trackProgress<T>(
  progress: Progress,
  from: number,
  to: number,
  task: Promise<T>,
  label?: string,
): Promise<T> {
  if (!progress.interactive) {
    progress.set(from, label);
    return task;
  }

  let value = from;
  progress.set(value, label);

  const timer = setInterval(() => {
    value += (to - value) * 0.08;
    progress.set(value, label);
  }, 200);

  try {
    return await task;
  } finally {
    clearInterval(timer);
  }
}
