# Voice Server SPA

A minimal boilerplate for a Single Page Application with an Express backend.

- **Frontend:** Vite + vanilla TypeScript
- **Backend:** Express + TypeScript
- **Dev:** Vite dev server (5173) with `/api` proxied to Express (3000)
- **Prod:** Express serves the built SPA from `dist/` with client-side routing fallback

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run backend (tsx watch) and frontend (Vite) together |
| `npm run dev:server` | Run only the Express server |
| `npm run dev:client` | Run only the Vite dev server |
| `npm run build` | Build the SPA (`dist/`) and compile the server (`dist-server/`) |
| `npm start` | Start the compiled production server |
| `./start_server.sh` | Bootstrap (deps only when stale) and start the backend — bash, Git Bash, WSL |
| `.\start_server.ps1` | Same bootstrap for Windows PowerShell |

Both scripts accept a default language: `./start_server.sh --language es-ES` or
`.\start_server.ps1 -Language es-ES`. Pass `auto` to let the model detect it.
This sets `STT_LANGUAGE` (see [Using the frontend](#using-the-frontend)).

## Production

```bash
npm run build
NODE_ENV=production npm start
```

The server listens on `PORT` (default `3000`) and serves both the API and the SPA.

## Structure

```
├── index.html              # Vite HTML entry
├── src/                    # Frontend source (vanilla TS)
│   ├── main.ts             # Setup form, mic controls, transcript UI
│   ├── style.css
│   └── lib/
│       ├── url.ts          # Server URL → realtime WebSocket URL
│       ├── stt.ts          # Transcription socket + event handling
│       └── mic.ts          # AudioWorklet PCM capture + waveform analyser
├── server/                 # Express backend
│   ├── index.ts            # Boot: patch console, listen, run startup checks
│   ├── app.ts              # Express app + static serving (production)
│   ├── routes/
│   │   └── api.ts          # API routes under /api
│   └── lib/
│       ├── bootstrap.ts    # Startup checks + install orchestration
│       ├── serverSetup.ts  # NeMo / hf CLI / model / STT server installers
│       ├── config.ts       # Ports and STT endpoint configuration
│       ├── ngrok_tunnel.ts # Optional public tunnels
│       ├── paths.ts        # Repo paths and model constants
│       ├── platform.ts     # OS helpers (PATH, PowerShell)
│       ├── runCommand.ts   # Child-process helper
│       ├── progress.ts     # Terminal progress bar
│       ├── logger.ts       # Console capture + SSE log buffer
│       └── checks/         # One read-only check per dependency
│           ├── nemo.ts
│           ├── hf.ts
│           ├── model.ts
│           ├── server.ts
│           ├── types.ts
│           └── index.ts
├── vite.config.ts          # Dev proxy + build config
├── tsconfig.json           # Client TS config
└── tsconfig.server.json    # Server TS config
```

## Startup behaviour

On boot the server verifies NeMo, the `hf` CLI, the ASR model and the STT
server. Each missing dependency is installed/started automatically, then
re-checked once. The final state is exposed at `GET /api/sanity_check`
(add `?refresh=1` to re-run read-only checks), and live logs stream from
`GET /api/logs` as server-sent events.

The STT server (`nemo-speech serve`) is spawned as a normal child process, so
Ctrl+C or closing the terminal stops it along with the app. Reloads triggered
by `tsx watch` (`SIGTERM`) leave it running, so editing files does not reload
the model.

## Troubleshooting

`http proxy error: /api/config` with `ECONNREFUSED` in the Vite output means
Vite is running without the Express backend: `/api` is proxied to
`http://localhost:3000`. Start both with `npm run dev`, or keep
`npm run dev:server` running in a second terminal. The client treats
`/api/config` as optional and falls back to its built-in default language, so
the page still works — only the `STT_LANGUAGE` prefill is missed.

## Exposing the app with ngrok

Tunnelling is optional and off by default. Grab an authtoken from the
[ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken), set
it in the environment, and the tunnel opens once the startup checks pass:

```powershell
$env:NGROK_AUTHTOKEN = "your-token"
npm run dev:server
```

```bash
export NGROK_AUTHTOKEN=your-token
./start_server.sh
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `NGROK_AUTHTOKEN` | — | Enables tunnelling |
| `NGROK_ADDR` | STT port (`8080`) | Local port(s) to expose, comma-separated |
| `NGROK_DOMAIN` | — | Reserved custom domain (single port only) |
| `NGROK_BASIC_AUTH` | — | `user:password` required by the public URL |

The public URL is logged at startup and served by `GET /api/tunnel`:

```json
{ "tunnels": [{ "addr": 8080, "url": "https://1a2b-3c4d.ngrok-free.app" }] }
```

Expose the Express app instead with `NGROK_ADDR=3000`, or both with
`NGROK_ADDR=8080,3000`. Tunnels are closed when the app stops (Ctrl+C).
Anybody with the URL can reach the tunneled port, so use `NGROK_BASIC_AUTH`
(or a reserved domain) if it is exposed for more than a quick test.

## Using the frontend

Open the app (Vite dev server at <http://localhost:5173>, or the Express app
at <http://localhost:3000> in production) and:

1. Enter the STT server URL — `http://localhost:8080` for the auto-started
   server, or the ngrok URL that forwards port 8080.
2. Enter the name shown next to each transcript segment.
3. Pick a language: a BCP-47 code such as `en-US` or `es-ES`, or `auto` to let
   the model detect it.
4. Press the microphone button and allow microphone access. Speech appears as
   a live partial line, then becomes a timestamped segment.
5. Press the button again to commit the last utterance and close the session.

The URL, name, and language are remembered in `localStorage`. The language
defaults to `STT_LANGUAGE` (default `en-US`); it is delivered to the STT server
in `session.update` when the socket opens. `nemo-speech serve` has no language
flag — language is a per-session setting — so this env var supplies the app's
default and the setup form can override it per session.

The capture panel reports three timings, all measured in the browser:

| Metric | Measured from → to |
| --- | --- |
| Connect | Opening the WebSocket → `session.update` sent |
| First partial | First PCM frame sent → first partial transcript |
| Final | Last PCM frame sent → final transcript |

Each transcript segment also shows its own finalization latency.

The browser talks to the STT server directly (it does not proxy audio through
Express), so the URL must be reachable from the browser. The spawned server is
started with `--cors-origin *` so cross-origin pages can connect; set
`STT_CORS_ORIGIN` to a single origin to restrict it.

If the app itself is served over HTTPS (for example through ngrok on port
3000), the browser blocks `ws://localhost:8080` as mixed content. Tunnel port
8080 as well and enter its `https://…` URL — the app converts it to `wss://`.

## Adding API routes

Create or edit files in `server/routes/` and mount them in `server/app.ts`:

```ts
app.use('/api/users', usersRouter);
```

## Adding client pages

This boilerplate has no router by default. Add one (e.g. `history`-based
navigation or a library like `@tanstack/router`) and fetch data with
`fetch('/api/...')`. In production the server falls back to `index.html` so
client-side routes work on refresh.
