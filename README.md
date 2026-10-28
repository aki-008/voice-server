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
├── index.html            # Vite HTML entry
├── src/                  # Frontend source (vanilla TS)
│   ├── main.ts
│   └── style.css
├── server/               # Express backend
│   ├── app.ts            # App entry, sanity checks, static serving
│   └── routes/
│       ├── api.ts        # API routes under /api
│       ├── runCommand.ts # Child-process helper
│       └── sanityCheck.ts# NeMo sanity check
├── vite.config.ts        # Dev proxy + build config
├── tsconfig.json         # Client TS config
└── tsconfig.server.json  # Server TS config
```

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
