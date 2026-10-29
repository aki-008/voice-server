/**
 * Microphone capture that produces 16-bit little-endian PCM chunks for the
 * STT WebSocket, plus an analyser feed for the waveform display.
 */

const TARGET_SAMPLE_RATE = 16_000;
const WORKLET_NAME = "pcm16-capture";

// Buffered so the port message rate stays around 60/s instead of one per
// 128-sample audio block.
const WORKLET_SOURCE = `
class Pcm16Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(1024);
    this.length = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.length] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.length += 1;
      if (this.length === this.buffer.length) {
        const chunk = this.buffer.slice(0);
        this.port.postMessage(chunk, [chunk.buffer]);
        this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(WORKLET_NAME)}, Pcm16Capture);
`;

export interface MicStartResult {
  /** Actual capture rate, which the server must be told via session.update. */
  sampleRate: number;
}

let workletUrl: string | null = null;

function workletModuleUrl(): string {
  workletUrl ??= URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "text/javascript" }),
  );
  return workletUrl;
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private waveform = new Float32Array(2048);

  async start(onChunk: (chunk: ArrayBuffer) => void): Promise<MicStartResult> {
    if (this.context) {
      throw new Error("The microphone is already running.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "This browser cannot access the microphone. Serve the page over https or localhost.",
      );
    }

    // Create/resume the context during the click that started capture, before
    // the permission prompt: mobile Safari only unlocks audio inside a gesture.
    const context = new AudioContext({
      sampleRate: TARGET_SAMPLE_RATE,
      latencyHint: "interactive",
    });
    this.context = context;
    void context.resume().catch(() => undefined);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (error) {
      await this.stop();
      throw new Error(microphoneError(error));
    }
    this.stream = stream;

    try {
      if (!context.audioWorklet) {
        throw new Error("This browser does not support realtime audio capture.");
      }
      await context.audioWorklet.addModule(workletModuleUrl());
      if (context.state === "suspended") await context.resume();

      const source = context.createMediaStreamSource(stream);

      const node = new AudioWorkletNode(context, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        onChunk(event.data);
      };

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.65;
      this.waveform = new Float32Array(analyser.fftSize);

      // A zero-gain sink keeps the worklet pulled without echoing the mic.
      const sink = context.createGain();
      sink.gain.value = 0;

      source.connect(analyser);
      source.connect(node);
      node.connect(sink);
      sink.connect(context.destination);

      this.source = source;
      this.node = node;
      this.analyser = analyser;
      this.sink = sink;

      return { sampleRate: context.sampleRate };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** Latest time-domain samples (-1…1), or null when not capturing. */
  getWaveform(): Float32Array | null {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.waveform);
    return this.waveform;
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.analyser?.disconnect();

    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }

    const context = this.context;
    this.context = null;
    this.node = null;
    this.source = null;
    this.sink = null;
    this.analyser = null;
    this.stream = null;

    if (context && context.state !== "closed") {
      await context.close().catch(() => undefined);
    }
  }
}

function microphoneError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was blocked. Allow it in the browser and try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No microphone was found.";
      case "NotReadableError":
        return "The microphone is already in use by another app.";
    }
  }
  return error instanceof Error ? error.message : "Could not open the microphone.";
}
