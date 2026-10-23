# OnyxChin

Multi-source donghua streaming API + web + docs.

- `apps/api` — Hono API, 5 source adapters, media/image/HLS proxy
- `apps/web` — streaming SPA (Vite + React 18 + hls.js)
- `apps/docs` — API reference + live playground
- `packages/shared` — shared types

```bash
npm install
npm run dev:api      # :8790
npm --workspace @onyxchin/web run dev
npm --workspace @onyxchin/docs run dev
```

See `PLAN.md` for recon, architecture, and deploy notes.
