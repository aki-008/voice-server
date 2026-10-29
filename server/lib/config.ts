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
