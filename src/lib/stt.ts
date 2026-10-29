/**
 * Minimal client for the NeMo Speech realtime transcription WebSocket
 * (`/v1/audio/transcriptions/realtime`).
 *
 * Protocol summary (see vendor/NeMoSpeech/share/doc/nemo-speech/docs/api.md):
 *   -> { type: "session.update", session: { sample_rate, language, … } }
 *   -> binary little-endian PCM16 frames
 *   -> { type: "input_audio_buffer.commit" }
 *   <- session.created / session.updated
 *   <- conversation.item.input_audio_transcription.delta   (partial)
 *   <- conversation.item.input_audio_transcription.completed (final)
 *   <- input_audio_buffer.committed
 *   <- error
 */

export interface SttSessionConfig {
  /** Sample rate of the PCM16 frames that will be sent. */
  sampleRate: number;
  language?: string;
  automaticPunctuation?: boolean;
  wordTimestamps?: boolean;
}

export interface SttHandlers {
  /** Called with the full partial transcript of the current utterance. */
  onPartial?: (text: string) => void;
  /** Called once per finished utterance. */
  onFinal?: (text: string) => void;
  /** The server accepted the final commit; the session can be closed. */
  onCommitted?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

interface ServerEvent {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
  error?: { message?: unknown };
}

export class SttClient {
  private socket: WebSocket | null = null;
  private partial = "";
  private committed = false;

  constructor(
    private readonly url: string,
    private readonly handlers: SttHandlers = {},
  ) {}

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Open the socket, resolve once `session.update` has been sent. */
  connect(config: SttSessionConfig): Promise<void> {
    if (this.socket) {
      return Promise.reject(new Error("Already connected."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.binaryType = "arraybuffer";

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "session.update",
            session: {
              sample_rate: config.sampleRate,
              language: config.language,
              automatic_punctuation: config.automaticPunctuation ?? true,
              word_timestamps: config.wordTimestamps ?? false,
            },
          }),
        );
        settled = true;
        resolve();
      };

      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          this.handleMessage(event.data);
        }
      };

      socket.onerror = () => {
        // Browsers hide the reason; onclose follows and carries a code.
        if (settled) return;
        settled = true;
        this.socket = null;
        reject(new Error(connectionErrorText(this.url)));
      };

      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null;
        if (!settled) {
          settled = true;
          reject(new Error(closeReason(event, this.url)));
        }
        this.handlers.onClose?.();
      };
    });
  }

  /** Send a chunk of little-endian PCM16 audio. */
  sendAudio(chunk: ArrayBuffer): void {
    if (!this.isOpen || this.committed) return;
    this.socket?.send(chunk);
  }

  /** Finish the current utterance: the server flushes and emits finals. */
  commit(): void {
    if (!this.isOpen || this.committed) return;
    this.committed = true;
    this.socket?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "client done");
  }

  private handleMessage(raw: string): void {
    let message: ServerEvent;
    try {
      message = JSON.parse(raw) as ServerEvent;
    } catch {
      return;
    }

    const type = typeof message.type === "string" ? message.type : "";

    if (type.endsWith(".delta")) {
      this.partial += typeof message.delta === "string" ? message.delta : "";
      this.handlers.onPartial?.(this.partial);
      return;
    }

    if (type.endsWith(".completed")) {
      const text =
        typeof message.transcript === "string" ? message.transcript.trim() : "";
      this.partial = "";
      this.handlers.onPartial?.("");
      if (text) this.handlers.onFinal?.(text);
      return;
    }

    if (type === "input_audio_buffer.committed") {
      this.committed = true;
      this.handlers.onCommitted?.();
      return;
    }

    if (type === "error") {
      const detail = message.error?.message;
      this.handlers.onError?.(
        typeof detail === "string" && detail ? detail : "The STT server reported an error.",
      );
    }
  }
}

function connectionErrorText(url: string): string {
  return `Could not connect to ${serverHost(url)}. Check the URL, that the server is running, and that it allows this page (CORS).`;
}

function closeReason(event: CloseEvent, url: string): string {
  if (event.reason) return event.reason;
  if (event.code === 1006) return connectionErrorText(url);
  return `The server closed the connection (code ${event.code}).`;
}

function serverHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
