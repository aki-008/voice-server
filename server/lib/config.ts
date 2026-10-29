function portOf(url: string, fallback: number): number {
  try {
    const { port } = new URL(url);
    return port ? Number(port) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_STT_URL = "http://127.0.0.1:8080/ready";

/** Express API port. */
export const APP_PORT = Number(process.env.PORT) || 3000;

/** Readiness endpoint of the NeMo STT server. */
export const STT_URL = process.env.STT_URL ?? DEFAULT_STT_URL;

/** Local port the STT server listens on (used as the default tunnel target). */
export const STT_PORT = portOf(STT_URL, 8080);

/**
 * Default language for realtime transcription. `auto` asks the model to
 * detect it. Note that `nemo-speech serve` has no language flag: language is a
 * per-session setting (`session.update`), so the client receives this default
 * from /api/config and sends it when it opens the socket.
 */
export const STT_LANGUAGE = process.env.STT_LANGUAGE?.trim() || "en-US";
