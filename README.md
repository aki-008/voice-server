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
