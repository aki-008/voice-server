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
│   ├── main.ts
│   └── style.css
├── server/                 # Express backend
│   ├── index.ts            # Boot: patch console, listen, run startup checks
│   ├── app.ts              # Express app + static serving (production)
│   ├── routes/
│   │   └── api.ts          # API routes under /api
│   └── lib/
│       ├── bootstrap.ts    # Startup checks + install orchestration
│       ├── serverSetup.ts  # NeMo / hf CLI / model / STT server installers
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
