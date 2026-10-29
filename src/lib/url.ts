/**
 * Turn whatever the user typed into the STT server into a WebSocket URL.
 *
 * Accepted forms:
 *   localhost:8080
 *   http://localhost:8080
 *   https://abc-123.ngrok-free.app
 *   wss://abc-123.ngrok-free.app/base?api_key=secret
 *
 * http(s) is mapped to ws(s). A bare host gets `http://` prepended, and an
 * empty/root path falls back to the realtime transcription endpoint.
 */

const DEFAULT_PATH = "/v1/audio/transcriptions/realtime";

const SOCKET_SCHEMES: Record<string, string> = {
  http: "ws",
  https: "wss",
  ws: "ws",
  wss: "wss",
};

/** True for something that already looks like `scheme://…`. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export function toWebSocketUrl(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("Enter the STT server URL.");
  }

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(raw) ? raw : `http://${raw}`);
  } catch {
    throw new Error(`"${raw}" is not a valid URL.`);
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const socketScheme = SOCKET_SCHEMES[scheme];
  if (!socketScheme) {
    throw new Error("Use an http(s) or ws(s) URL.");
  }
  if (!url.hostname) {
    throw new Error("The URL is missing a host name.");
  }

  url.protocol = `${socketScheme}:`;
  if (url.pathname === "" || url.pathname === "/") {
    url.pathname = DEFAULT_PATH;
  }

  return url.toString();
}

/** Short human-readable label for a server URL, e.g. `localhost:8080`. */
export function serverLabel(input: string): string {
  try {
    return new URL(input).host;
  } catch {
    return input;
  }
}
