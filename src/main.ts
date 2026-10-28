import './style.css';

interface LogEntry {
  id: number;
  time: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('#app element not found');
}

app.innerHTML = `
  <main>
    <header>
      <h1>Voice Server</h1>
      <span id="status" class="status">connecting…</span>
    </header>
    <div class="toolbar">
      <span id="count">0 lines</span>
      <button id="clear" type="button">Clear</button>
    </div>
    <pre id="logs" class="logs" aria-live="polite"></pre>
  </main>
`;

const logsEl = document.querySelector<HTMLPreElement>('#logs');
const statusEl = document.querySelector<HTMLSpanElement>('#status');
const countEl = document.querySelector<HTMLSpanElement>('#count');
const clearBtn = document.querySelector<HTMLButtonElement>('#clear');

if (!logsEl || !statusEl || !countEl || !clearBtn) {
  throw new Error('log viewer elements missing');
}

let lastId = 0;
let count = 0;

function append(entry: LogEntry) {
  if (entry.id <= lastId) return;
  lastId = entry.id;

  const atBottom =
    logsEl!.scrollHeight - logsEl!.scrollTop - logsEl!.clientHeight < 40;

  const line = document.createElement('div');
  line.className = `log log-${entry.level}`;
  const time = entry.time.slice(11, 23);
  line.textContent = `[${time}] ${entry.level.toUpperCase().padEnd(5)} ${entry.message}`;
  logsEl!.appendChild(line);

  count++;
  countEl!.textContent = `${count} lines`;

  if (atBottom) {
    logsEl!.scrollTop = logsEl!.scrollHeight;
  }
}

function setStatus(text: string, live: boolean) {
  statusEl!.textContent = text;
  statusEl!.classList.toggle('live', live);
}

const source = new EventSource('/api/logs');

source.onopen = () => setStatus('● live', true);
source.onerror = () => setStatus('● reconnecting…', false);
source.onmessage = (event) => {
  try {
    append(JSON.parse(event.data) as LogEntry);
  } catch {
    // Ignore malformed frames (e.g. heartbeats).
  }
};

clearBtn.addEventListener('click', () => {
  logsEl!.replaceChildren();
  count = 0;
  countEl!.textContent = '0 lines';
});
