import type { Listener } from "@ngrok/ngrok";

import { STT_PORT } from "./config.js";

export interface Tunnel {
  /** Local port being forwarded. */
  addr: number;
  /** Public https:// URL of the tunnel. */
  url: string;
}

let listeners: Listener[] = [];
let tunnels: Tunnel[] = [];

/** Tunnelling is opt-in: set NGROK_AUTHTOKEN to enable it. */
export function isTunnelConfigured(): boolean {
  return Boolean(process.env.NGROK_AUTHTOKEN?.trim());
}

export function getTunnels(): Tunnel[] {
  return tunnels.map((tunnel) => ({ ...tunnel }));
}

/** `NGROK_ADDR` accepts one port or a comma-separated list ("8080" / "8080,3000"). */
function targetPorts(): number[] {
  const raw = process.env.NGROK_ADDR?.trim() || String(STT_PORT);
  const ports = raw.split(",").map((part) => Number(part.trim()));

  const invalid = ports.filter(
    (port) => !Number.isInteger(port) || port <= 0 || port > 65_535,
  );
  if (invalid.length > 0) {
    throw new Error(
      `NGROK_ADDR must be a port or comma-separated ports, got "${raw}"`,
    );
  }
  return ports;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function open(): Promise<Tunnel[]> {
  let ports: number[];
  try {
    ports = targetPorts();
  } catch (err) {
    console.warn(`⚠ ngrok tunnel skipped: ${errorMessage(err)}`);
    return [];
  }

  const domain = process.env.NGROK_DOMAIN?.trim();
  if (domain && ports.length > 1) {
    console.warn("⚠ NGROK_DOMAIN ignored: it supports a single port only");
  }

  const basicAuth = process.env.NGROK_BASIC_AUTH?.trim();
  const opened: Listener[] = [];

  try {
    // Loaded lazily so the native addon never runs when tunnelling is disabled.
    const { forward } = await import("@ngrok/ngrok");

    for (const port of ports) {
      const listener = await forward({
        addr: port,
        authtoken_from_env: true,
        ...(domain && ports.length === 1 ? { domain } : {}),
        ...(basicAuth ? { basic_auth: basicAuth } : {}),
      });

      const url = listener.url();
      if (!url) {
        await listener.close();
        throw new Error(`ngrok returned no public URL for port ${port}`);
      }

      opened.push(listener);
      tunnels.push({ addr: port, url });
      console.log(`✓ ngrok: ${url} → http://localhost:${port}`);
    }

    listeners = opened;
    return getTunnels();
  } catch (err) {
    await Promise.allSettled(opened.map((listener) => listener.close()));
    tunnels = [];
    console.warn(`⚠ ngrok tunnel failed: ${errorMessage(err)}`);
    return [];
  }
}

/** Open the tunnel(s) declared by the environment. No-op without NGROK_AUTHTOKEN. */
export async function startTunnels(): Promise<Tunnel[]> {
  if (!isTunnelConfigured()) return [];
  if (tunnels.length > 0) return getTunnels();
  return open();
}

/** Close every tunnel opened by this process. */
export async function stopTunnels(): Promise<void> {
  const active = listeners;
  listeners = [];
  tunnels = [];

  if (active.length > 0) {
    await Promise.allSettled(active.map((listener) => listener.close()));
  }
}
