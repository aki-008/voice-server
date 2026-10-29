import "./style.css";

import { MicCapture } from "./lib/mic.js";
import { SttClient } from "./lib/stt.js";
import { serverLabel, toWebSocketUrl } from "./lib/url.js";

const URL_KEY = "voice.serverUrl";
const NAME_KEY = "voice.username";
const LANGUAGE_KEY = "voice.language";
const DEFAULT_URL = "http://localhost:8080";
const DEFAULT_LANGUAGE = "en-US";

type Stage = "idle" | "connecting" | "live" | "stopping";
type Tone = "off" | "ready" | "pending" | "live" | "error";
type StatusTone = "idle" | "pending" | "live" | "error";

interface Identity {
  username: string;
  serverUrl: string;
  wsUrl: string;
  language: string;
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("#app element not found");
}
const app: HTMLDivElement = root;

app.innerHTML = `
  <main class="app">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
            <path d="M4 10v4" />
            <path d="M8 6v12" />
            <path d="M12 3v18" />
            <path d="M16 6v12" />
            <path d="M20 10v4" />
          </svg>
        </span>
        <div class="brand-text">
          <h1>Voice</h1>
          <p>Live transcription</p>
        </div>
      </div>
      <span id="connection" class="pill" data-tone="off">Not connected</span>
    </header>

    <section id="setup" class="card setup" aria-labelledby="setup-title">
      <div class="setup-intro">
        <h2 id="setup-title">Connect to your STT server</h2>
        <p>Point the app at a running NeMo Speech server, then speak.</p>
      </div>
      <form id="setup-form" class="setup-form" novalidate>
        <label class="field">
          <span class="field-label">Server URL</span>
          <input
            id="server-url"
            name="serverUrl"
            type="text"
            inputmode="url"
            autocomplete="url"
            spellcheck="false"
            placeholder="http://localhost:8080"
            required
          />
          <small>Local server or your ngrok https URL.</small>
        </label>
        <label class="field">
          <span class="field-label">Your name</span>
          <input
            id="username"
            name="username"
            type="text"
            autocomplete="nickname"
            maxlength="40"
            placeholder="Ada Lovelace"
            required
          />
          <small>Shown next to every transcript segment.</small>
        </label>
        <label class="field field-language">
          <span class="field-label">Language</span>
          <input
            id="language"
            name="language"
            type="text"
            list="language-options"
            autocomplete="off"
            spellcheck="false"
            placeholder="en-US"
          />
          <small>BCP-47 code, or auto to detect.</small>
        </label>
        <datalist id="language-options">
          <option value="auto"></option>
          <option value="en-US"></option>
          <option value="en-GB"></option>
          <option value="es-ES"></option>
          <option value="es-US"></option>
          <option value="fr-FR"></option>
          <option value="fr-CA"></option>
          <option value="de-DE"></option>
          <option value="it-IT"></option>
          <option value="pt-BR"></option>
          <option value="pt-PT"></option>
          <option value="nl-NL"></option>
          <option value="pl-PL"></option>
          <option value="ru-RU"></option>
          <option value="tr-TR"></option>
          <option value="uk-UA"></option>
          <option value="sv-SE"></option>
          <option value="da-DK"></option>
          <option value="fi-FI"></option>
          <option value="nb-NO"></option>
          <option value="cs-CZ"></option>
          <option value="sk-SK"></option>
          <option value="ro-RO"></option>
          <option value="hu-HU"></option>
          <option value="el-GR"></option>
          <option value="bg-BG"></option>
          <option value="hr-HR"></option>
          <option value="hi-IN"></option>
          <option value="ta-IN"></option>
          <option value="te-IN"></option>
          <option value="bn-IN"></option>
          <option value="ur-PK"></option>
          <option value="ar-AR"></option>
          <option value="he-IL"></option>
          <option value="fa-IR"></option>
          <option value="ja-JP"></option>
          <option value="ko-KR"></option>
          <option value="zh-CN"></option>
          <option value="zh-TW"></option>
          <option value="vi-VN"></option>
          <option value="th-TH"></option>
          <option value="id-ID"></option>
          <option value="ms-MY"></option>
          <option value="sw-KE"></option>
          <option value="af-ZA"></option>
        </datalist>
        <p id="setup-error" class="form-error" role="alert" hidden></p>
        <button id="connect" class="button primary" type="submit">Continue</button>
      </form>
    </section>

    <section id="session" class="session" hidden>
      <div class="identity card">
        <div class="identity-item">
          <span class="identity-label">Speaking as</span>
          <strong id="identity-name"></strong>
        </div>
        <div class="identity-item">
          <span class="identity-label">Language</span>
          <strong id="identity-language" class="mono"></strong>
        </div>
        <div class="identity-item">
          <span class="identity-label">Server</span>
          <strong id="identity-server" class="mono"></strong>
        </div>
        <button id="edit" class="button ghost small" type="button">Change</button>
      </div>

      <div class="card capture">
        <button
          id="mic"
          class="mic"
          type="button"
          aria-label="Start recording"
          aria-pressed="false"
        >
          <span class="mic-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </span>
          <span class="stop-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="8" y="8" width="8" height="8" rx="1.5" />
            </svg>
          </span>
        </button>

        <canvas id="waveform" class="waveform" aria-hidden="true"></canvas>
        <p id="status" class="capture-status" data-tone="idle" role="status">
          Ready — tap the microphone and start speaking.
        </p>
        <dl class="latency" aria-label="Latency">
          <div>
            <dt>Connect</dt>
            <dd id="latency-connect">—</dd>
          </div>
          <div>
            <dt>First partial</dt>
            <dd id="latency-partial">—</dd>
          </div>
          <div>
            <dt>Final</dt>
            <dd id="latency-final">—</dd>
          </div>
        </dl>
      </div>

      <div class="card transcript">
        <div class="transcript-head">
          <h2>Transcript</h2>
          <span id="count" class="muted">0 segments</span>
          <button id="clear" class="button ghost small" type="button">Clear</button>
        </div>
        <div id="transcript-body" class="transcript-body">
          <p id="empty" class="empty">
            Nothing yet — your speech will appear here as you talk.
          </p>
          <ol id="segments" class="segments" aria-live="polite" aria-relevant="additions"></ol>
          <p id="partial" class="partial" hidden></p>
        </div>
      </div>
    </section>
  </main>
`;

function el<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}

const setupEl = el<HTMLElement>("#setup");
const sessionEl = el<HTMLElement>("#session");
const form = el<HTMLFormElement>("#setup-form");
const urlInput = el<HTMLInputElement>("#server-url");
const nameInput = el<HTMLInputElement>("#username");
const languageInput = el<HTMLInputElement>("#language");
const setupError = el<HTMLParagraphElement>("#setup-error");
const identityName = el<HTMLElement>("#identity-name");
const identityLanguage = el<HTMLElement>("#identity-language");
const identityServer = el<HTMLElement>("#identity-server");
const editButton = el<HTMLButtonElement>("#edit");
const micButton = el<HTMLButtonElement>("#mic");
const statusEl = el<HTMLParagraphElement>("#status");
const connectionEl = el<HTMLSpanElement>("#connection");
const canvas = el<HTMLCanvasElement>("#waveform");
const transcriptBody = el<HTMLDivElement>("#transcript-body");
const segmentsEl = el<HTMLOListElement>("#segments");
const partialEl = el<HTMLParagraphElement>("#partial");
const emptyEl = el<HTMLParagraphElement>("#empty");
const countEl = el<HTMLSpanElement>("#count");
const clearButton = el<HTMLButtonElement>("#clear");
const latencyConnectEl = el<HTMLElement>("#latency-connect");
const latencyPartialEl = el<HTMLElement>("#latency-partial");
const latencyFinalEl = el<HTMLElement>("#latency-final");

const ctx = canvas.getContext("2d");
const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

let identity: Identity | null = null;
let stage: Stage = "idle";
let mic: MicCapture | null = null;
let stt: SttClient | null = null;
let segments = 0;
let commitTimer: number | undefined;

/** Timing for the latency read-outs (all values from performance.now()). */
let utteranceStartedAt: number | null = null;
let lastAudioAt = 0;
let awaitingFirstPartial = false;

/* ------------------------------------------------------------------ setup */

const savedLanguage = readStorage(LANGUAGE_KEY);
urlInput.value = readStorage(URL_KEY) || DEFAULT_URL;
nameInput.value = readStorage(NAME_KEY);
languageInput.value = savedLanguage || DEFAULT_LANGUAGE;

let languageEdited = false;

for (const input of [urlInput, nameInput, languageInput]) {
  input.addEventListener("input", () => {
    setupError.hidden = true;
  });
}
languageInput.addEventListener("input", () => {
  languageEdited = true;
});

void loadServerLanguage();

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = nameInput.value.trim();
  if (!username) {
    failSetup("Enter your name.", nameInput);
    return;
  }

  const language = languageInput.value.trim() || "auto";

  let wsUrl: string;
  try {
    wsUrl = toWebSocketUrl(urlInput.value);
  } catch (error) {
    failSetup(errorText(error), urlInput);
    return;
  }

  const serverUrl = urlInput.value.trim();
  const changed =
    !identity ||
    identity.username !== username ||
    identity.serverUrl !== serverUrl ||
    identity.language !== language;

  identity = { username, serverUrl, wsUrl, language };
  writeStorage(URL_KEY, serverUrl);
  writeStorage(NAME_KEY, username);
  writeStorage(LANGUAGE_KEY, language);

  if (changed) clearTranscript();

  setupError.hidden = true;
  setupEl.hidden = true;
  sessionEl.hidden = false;
  identityName.textContent = username;
  identityLanguage.textContent = language;
  identityServer.textContent = serverLabel(wsUrl);
  identityServer.title = serverLabel(wsUrl);

  setConnection("Ready", "ready");
  setStatus("Ready — tap the microphone and start speaking.", "idle");
  micButton.focus({ preventScroll: true });
  resizeCanvas();
});

editButton.addEventListener("click", () => {
  if (stage !== "idle") return;

  if (identity) {
    urlInput.value = identity.serverUrl;
    nameInput.value = identity.username;
    languageInput.value = identity.language;
  }
  setupEl.hidden = false;
  sessionEl.hidden = true;
  setupError.hidden = true;
  setConnection("Not connected", "off");
  urlInput.focus();
  urlInput.select();
});

/** Prefill the language from the app's STT_LANGUAGE unless the user saved one. */
async function loadServerLanguage(): Promise<void> {
  if (savedLanguage) return;

  try {
    const response = await fetch("/api/config");
    if (!response.ok) return;

    const config = (await response.json()) as { language?: unknown };
    if (languageEdited) return;
    if (typeof config.language === "string" && config.language.trim()) {
      languageInput.value = config.language.trim();
    }
  } catch {
    // The API is optional here; the built-in default is fine.
  }
}

function failSetup(message: string, input: HTMLInputElement): void {
  setupError.textContent = message;
  setupError.hidden = false;
  input.focus();
}

/* --------------------------------------------------------------- capture */

micButton.addEventListener("click", () => {
  if (stage === "live") {
    void stopCapture();
  } else if (stage === "idle") {
    void startCapture();
  }
});

async function startCapture(): Promise<void> {
  if (stage !== "idle" || !identity) return;

  const { wsUrl, language } = identity;

  setStage("connecting");
  setConnection("Connecting", "pending");
  setStatus("Requesting microphone access…", "pending");
  resetLatency();
  resetUtteranceTiming();

  let session: MicCapture | null = null;
  let client: SttClient | null = null;

  try {
    session = new MicCapture();
    const { sampleRate } = await session.start((chunk) => {
      // Only timestamps matter once the frame actually reached the socket.
      if (!client?.sendAudio(chunk)) return;

      const now = performance.now();
      if (utteranceStartedAt === null) {
        utteranceStartedAt = now;
        awaitingFirstPartial = true;
      }
      lastAudioAt = now;
    });
    mic = session;

    setStatus("Connecting to the server…", "pending");

    client = new SttClient(wsUrl, {
      onPartial: (text) => {
        if (text && awaitingFirstPartial && utteranceStartedAt !== null) {
          awaitingFirstPartial = false;
          setLatency(latencyPartialEl, performance.now() - utteranceStartedAt);
        }
        showPartial(text);
      },
      onFinal: (text) => {
        const finalLatency =
          lastAudioAt > 0 ? performance.now() - lastAudioAt : null;

        if (text) {
          addSegment(text, finalLatency);
          if (finalLatency !== null) {
            setLatency(latencyFinalEl, finalLatency);
          }
        }
        resetUtteranceTiming();
      },
      onCommitted: () => finishStop(),
      onError: (message) => reportServerError(message),
      onClose: () => {
        if (stage === "live") {
          void teardownAfterClose("The server closed the connection.");
        } else if (stage === "stopping") {
          finishStop();
        }
      },
    });
    stt = client;

    const connectStartedAt = performance.now();
    await client.connect({
      sampleRate,
      language,
      automaticPunctuation: true,
    });
    setLatency(latencyConnectEl, performance.now() - connectStartedAt);

    if (stageNow() !== "connecting" || mic !== session || stt !== client) {
      client.close();
      return;
    }

    setStage("live");
    setConnection("Live", "live");
    setStatus("Listening — tap the microphone to stop.", "live");
  } catch (error) {
    client?.close();
    await session?.stop();
    if (mic === session) mic = null;
    if (stt === client) stt = null;

    setStage("idle");
    setConnection("Not connected", "off");
    setStatus(errorText(error), "error");
  }
}

async function stopCapture(): Promise<void> {
  if (stage !== "live") return;

  setStage("stopping");
  setConnection("Finishing", "pending");
  setStatus("Finishing the last utterance…", "pending");

  await releaseMic();
  stt?.commit();

  window.clearTimeout(commitTimer);
  commitTimer = window.setTimeout(finishStop, 5000);
}

function finishStop(): void {
  if (stage !== "stopping") return;

  window.clearTimeout(commitTimer);
  stt?.close();
  stt = null;
  showPartial("");
  setStage("idle");
  setConnection("Ready", "ready");
  setStatus("Ready — tap the microphone and start speaking.", "idle");
}

async function teardownAfterClose(message: string): Promise<void> {
  if (stage !== "live") return;

  setStage("stopping");
  await releaseMic();
  stt = null;
  showPartial("");

  setStage("idle");
  setConnection("Not connected", "off");
  setStatus(message, "error");
}

async function releaseMic(): Promise<void> {
  const active = mic;
  mic = null;
  await active?.stop();
}

function reportServerError(message: string): void {
  if (stage === "stopping") {
    finishStop();
    return;
  }
  setStatus(message, "error");
}

/* ------------------------------------------------------------- transcript */

clearButton.addEventListener("click", clearTranscript);

function addSegment(text: string, latencyMs: number | null = null): void {
  const atBottom = isNearBottom();

  const item = document.createElement("li");
  item.className = "segment";

  const meta = document.createElement("div");
  meta.className = "segment-meta";

  const author = document.createElement("span");
  author.className = "segment-author";
  author.textContent = identity?.username ?? "You";

  const now = new Date();
  const time = document.createElement("time");
  time.dateTime = now.toISOString();
  time.textContent = clock.format(now);

  meta.append(author, time);

  if (latencyMs !== null) {
    const latency = document.createElement("span");
    latency.className = "segment-latency";
    latency.textContent = `final ${formatLatency(latencyMs)}`;
    latency.title = "Time from the last audio frame to the final transcript";
    meta.append(latency);
  }

  const body = document.createElement("p");
  body.className = "segment-text";
  body.textContent = text;

  item.append(meta, body);
  segmentsEl.append(item);

  segments += 1;
  countEl.textContent = `${segments} segment${segments === 1 ? "" : "s"}`;
  updateEmptyState();

  if (atBottom) scrollToBottom();
}

function showPartial(text: string): void {
  const atBottom = isNearBottom();
  partialEl.textContent = text;
  partialEl.hidden = text.length === 0;
  updateEmptyState();
  if (atBottom) scrollToBottom();
}

function updateEmptyState(): void {
  emptyEl.hidden = segments > 0 || !partialEl.hidden;
}

function clearTranscript(): void {
  segments = 0;
  segmentsEl.replaceChildren();
  countEl.textContent = "0 segments";
  partialEl.hidden = true;
  partialEl.textContent = "";
  updateEmptyState();
}

function isNearBottom(): boolean {
  return (
    transcriptBody.scrollHeight -
      transcriptBody.scrollTop -
      transcriptBody.clientHeight <
    80
  );
}

function scrollToBottom(): void {
  transcriptBody.scrollTop = transcriptBody.scrollHeight;
}

/* ---------------------------------------------------------------- status */

/**
 * Read the stage through a call: TypeScript would otherwise keep the
 * narrowing from `if (stage !== "idle")` even after startCapture() moves on.
 */
function stageNow(): Stage {
  return stage;
}

function setStage(next: Stage): void {
  stage = next;
  app.dataset.stage = next;
  const busy = next === "connecting" || next === "stopping";
  micButton.disabled = busy;
  micButton.classList.toggle("is-live", next === "live");
  micButton.classList.toggle("is-busy", busy);
  micButton.setAttribute(
    "aria-label",
    next === "live" ? "Stop recording" : "Start recording",
  );
  micButton.setAttribute("aria-pressed", String(next === "live"));
  editButton.disabled = next !== "idle";
}

function setStatus(text: string, tone: StatusTone): void {
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function setConnection(text: string, tone: Tone): void {
  connectionEl.textContent = text;
  connectionEl.dataset.tone = tone;
}

/* --------------------------------------------------------------- latency */

function resetLatency(): void {
  setLatency(latencyConnectEl, null);
  setLatency(latencyPartialEl, null);
  setLatency(latencyFinalEl, null);
}

function setLatency(element: HTMLElement, milliseconds: number | null): void {
  element.textContent =
    milliseconds === null ? "—" : formatLatency(milliseconds);
}

function formatLatency(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

function resetUtteranceTiming(): void {
  utteranceStartedAt = null;
  lastAudioAt = 0;
  awaitingFirstPartial = false;
}

/* -------------------------------------------------------------- waveform */

const BAR_COUNT = 60;
const levels = new Float32Array(BAR_COUNT);
let cssWidth = 0;
let cssHeight = 0;
let phase = 0;

function resizeCanvas(): void {
  if (sessionEl.hidden) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cssWidth = rect.width;
  cssHeight = rect.height;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawFrame(): void {
  if (ctx && !sessionEl.hidden) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (
        Math.abs(rect.width - cssWidth) > 0.5 ||
        Math.abs(rect.height - cssHeight) > 0.5
      ) {
        resizeCanvas();
      }
      renderBars();
    }
  }
  requestAnimationFrame(drawFrame);
}

function renderBars(): void {
  if (!ctx || cssWidth < 1 || cssHeight < 1) return;

  const width = cssWidth;
  const height = cssHeight;
  const mid = height / 2;
  const gap = Math.max(2, width * 0.004);
  const barWidth = Math.max(2, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT);
  const data = stage === "live" ? mic?.getWaveform() : null;
  const live = stage === "live" || stage === "stopping";

  phase += 0.06;
  ctx.clearRect(0, 0, width, height);

  let fill: string | CanvasGradient = "rgba(148, 163, 184, 0.24)";
  if (live) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#b6f36a");
    gradient.addColorStop(0.5, "#8fd400");
    gradient.addColorStop(1, "#76b900");
    fill = gradient;
    ctx.shadowColor = "rgba(118, 185, 0, 0.4)";
    ctx.shadowBlur = 12;
  }

  for (let i = 0; i < BAR_COUNT; i += 1) {
    let target: number;

    if (data) {
      const from = Math.floor((i / BAR_COUNT) * data.length);
      const to = Math.max(
        from + 1,
        Math.floor(((i + 1) / BAR_COUNT) * data.length),
      );
      let sum = 0;
      for (let j = from; j < to; j += 1) sum += data[j] * data[j];
      const rms = Math.sqrt(sum / (to - from));
      target = Math.min(1, Math.sqrt(rms * 2.6));
    } else {
      const wave = (Math.sin(phase + i * 0.42) + 1) / 2;
      target =
        stage === "connecting" || stage === "stopping"
          ? 0.1 + wave * 0.12
          : 0.05 + wave * 0.05;
    }

    // Rise quickly on speech, fall gently afterwards.
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.4 : 0.12);

    const barHeight = Math.max(2.5, levels[i] * height * 0.86);
    const x = i * (barWidth + gap);
    const y = mid - barHeight / 2;

    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    } else {
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.fillStyle = fill;
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pagehide", () => {
  stt?.close();
  void mic?.stop();
});

/* -------------------------------------------------------------- lifecycle */

setStage("idle");
setConnection("Not connected", "off");
setStatus("Ready — tap the microphone and start speaking.", "idle");
setupEl.hidden = false;
sessionEl.hidden = true;
requestAnimationFrame(drawFrame);

/* ---------------------------------------------------------------- helpers */

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the app still works.
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
