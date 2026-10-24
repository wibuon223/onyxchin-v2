# OnyxChin

Multi-source donghua streaming — API + web streaming + API docs terpisah.

- **API** https://onyxchin-api.onrender.com
- **Web** https://onyxchin-web.onrender.com
- **Docs** https://onyxchin-docs.onrender.com

## Struktur

| Path | Isi |
|---|---|
| `apps/api` | Hono API, 5 adapter sumber, proxy image/media/HLS/subtitle, TTL cache, relay fallback |
| `apps/web` | Streaming SPA (Vite + React 18 + hls.js) — hero, rails, browse, search, detail, player |
| `apps/docs` | API reference + live playground (vanilla TS) |
| `packages/shared` | Kontrak tipe `SourceAdapter`, `Card`, `VideoSource`, dll |
| `tools/deploy-render.mjs` | Buat/update 3 service Render via API |
| `tools/smoke.mjs` | Health check semua sumber |
| `tools/fetch-relay.mjs` | Relay outbound (residential) untuk host yang memblokir IP datacenter |

## Local

```bash
npm install
npm run build:shared
npm run dev:api                                  # :8891
npm --workspace @onyxchin/web run dev            # :5173
npm --workspace @onyxchin/docs run dev           # :5174
node tools/smoke.mjs http://127.0.0.1:8891
```

## Deploy

```bash
RENDER_API_KEY=... node tools/deploy-render.mjs          # create/update 3 services
curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services/<id>/deploys        # trigger rebuild after push
```

Detail keputusan & hasil recon ada di [`PLAN.md`](./PLAN.md).
