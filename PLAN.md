# OnyxChin — Plan & Recon Report

> Multi-source donghua streaming. Satu API, satu web streaming, satu docs terpisah.
> Target deploy: Render (workspace `My Workspace` / `tea-db808lgn74is73d9i8f0`).


## 0. Live sekarang (deployed 24 Okt 2026)

| Service | URL | Status |
|---|---|---|
| API | https://onyxchin-api.onrender.com | live (free plan, cold start ±30s) |
| Web streaming | https://onyxchin-web.onrender.com | live |
| API docs + playground | https://onyxchin-docs.onrender.com | live |
| Repo | https://github.com/wibuon223/onyxchin-v2 | public |

Catatan produksi penting: **animexin.dev, yunshanid.site, donghuaworld.com memblokir IP datacenter Cloudflare (403) dari Render.**
API sekarang fallback otomatis ke relay (`ocf.empty.codes`, tunnel ke box rumah) untuk host tersebut; kalau relay mati, jatuh ke proxy publik (allorigins). Rajadonghua & anichin tetap direct.

---

## 1. Recon — hasil probe live (24 Okt 2026)

| # | Situs | Platform | Katalog | Stream provider | Kualitas playback |
|---|-------|----------|---------|-----------------|-------------------|
| 1 | **rajadonghua.com** | Custom PHP + SPA, public JSON API `/api/v1` | 715 judul (pagination `total`) | **1 sumber terbaik**: file MP4 sendiri, 4 kualitas (1080/720/480/360) + subtitle `.srt` Indonesia | ⭐⭐⭐⭐⭐ native `<video>`, signed token ~1 hari |
| 2 | **anichin.my** | WordPress 7.1.3 + theme `animestream` | 18.108 post (REST `X-WP-Total`) | 5 mirror/episode: OK.ru, Dailymotion, morencius (Rumble), hgcloud, rubyvidhub | ⭐⭐⭐ OK.ru paling stabil; DM domain-locked |
| 3 | **animexin.dev** | WordPress + `animestream` (REST diblok 401) | ~58 sitemap × 1001 ≈ puluhan ribu | 8 mirror/episode: gdriveplayer ×6 bahasa (ID/EN/PT/TR/ES/IT), Doodstream, Dailymotion | ⭐⭐⭐ gdriveplayer paling banyak bahasa |
| 4 | **yunshanid.site** | Astro + React islands | 2.140 episode ter-index (sitemap) | Google Drive `/preview` (mayoritas), sebagian Dailymotion | ⭐⭐⭐⭐ GDrive embeddable, bersih |
| 5 | **donghuaworld.com** | WordPress + `animestream` + LiteSpeed | 20.496 post | 1 player sendiri `playing.donghuaworld.in` — `sources: []`, **butuh VPN (dark server)** | ⭐ tidak reliable dari server |

### Kesimpulan pemilihan sumber
1. **rajadonghua = sumber utama.** Bukan karena katalognya paling besar, tapi karena satu-satunya yang memberi **MP4 langsung** → player kita bisa full custom (seek, kualitas, subtitle), tanpa iframe pihak ketiga, tanpa iklan.
2. **anichin.my = sumber katalog terbesar yang playable.** 5 mirror, OK.ru jalan.
3. **animexin.dev = sumber paling banyak mirror** (8, multi-bahasa) — sesuai dugaan baby, tapi kualitas stream bergantung host eksternal.
4. **yunshanid = cadangan bersih** (GDrive preview).
5. **donghuaworld = metadata + fallback link** (dark server, tidak diandalkan untuk playback).

> Catatan: anichin.my adalah mirror TLD dari keluarga anichin (`.moe`/`.cafe`) yang sudah kita scrape sebelumnya — selector `animestream` sama, jadi adapter bisa reuse pola lama.

---

## 2. Arsitektur

```
                       ┌───────────────────────────┐
   Browser  ──────────▶│  onyxchin-web (static)    │  streaming SPA
                       │  Vite + React 18          │
                       └────────────┬──────────────┘
                                    │ fetch JSON
                       ┌────────────▼──────────────┐
                       │  onyxchin-api (node)      │  Hono + cheerio
                       │  /api/:source/*           │  5 adapter
                       │  /api/img /api/media /api/hls
                       └────────────┬──────────────┘
                                    │ scrape / JSON
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        rajadonghua /api/v1            anichin · animexin · yunshanid · donghuaworld
        (MP4 + SRT signed)             (HTML animestream + iframe mirrors)

                       ┌───────────────────────────┐
                       │  onyxchin-docs (static)   │  API reference + live playground
                       └───────────────────────────┘
```

### Struktur repo
```
onyxchin/
├─ apps/api/          # Hono, adapter per sumber, proxy image/media/HLS
├─ apps/web/          # Vite + React 18 + hls.js (streaming)
├─ apps/docs/         # Vite + TS (API docs + playground)
└─ packages/shared/   # kontrak tipe SourceAdapter / Card / VideoSource
```

### Kontrak API (ringkas)
| Endpoint | Fungsi |
|---|---|
| `GET /api/sources` | daftar sumber |
| `GET /api/:source/home` | hero + sections |
| `GET /api/:source/list?page&genre&order` | katalog + filter |
| `GET /api/:source/search?q=` | pencarian |
| `GET /api/:source/anime/:slug` | detail + episode |
| `GET /api/:source/watch/:slug/:ep` | sources[] + subtitles |
| `GET /api/img?url=` | proxy poster (anti-hotlink) |
| `GET /api/media?u=&ref=` | proxy MP4 dengan **Range** (seek) |
| `GET /api/hls?u=` | rewrite playlist m3u8 |
| `GET /api/sub?u=` | proxy subtitle + auto SRT→WebVTT |

`VideoSource.kind`: `direct` (mp4) · `hls` (m3u8) · `iframe` (embed) · `external` (buka tab baru).
`playable` = benar-benar bisa diputar browser kita. UI memisahkan yang playable vs yang tidak (dengan alasan).

---

## 3. UI/UX

**Arah visual:** editorial-cinematic, dark obsidian, aksen vermillion — bukan clone Netflix, bukan template.

- **Warna:** `#07080A` ink · `#EDE6DA` text · `#E5484D` vermillion · `#D8A657` gold (rating).
- **Tipografi:** `Fraunces` (display serif, judul film) + `Inter` (UI) + `JetBrains Mono` (label metadata).
- **Struktur:** hairline rules, poster 2:3 dengan inner ring + hover reveal, hero dengan backdrop blur poster.
- **Detail:** ⌘K command palette, continue-watching (localStorage), server/quality segmented chips, episode grid dengan progress, skeleton shimmer, reduced-motion aware.

**Dua web terpisah (sesuai permintaan):**
1. `onyxchin-web` → streaming.
2. `onyxchin-docs` → dokumentasi API + **live playground** (bisa hit endpoint asli dari browser).

---

## 4. Deploy (Render)

| Service | Tipe | Build | Publish/Start |
|---|---|---|---|
| `onyxchin-api` | Web Service (Node) | `npm ci && npm run build:api` | `npm run start:api` |
| `onyxchin-web` | Static Site | `npm ci && npm run build:web` | `apps/web/dist` |
| `onyxchin-docs` | Static Site | `npm ci && npm run build:docs` | `apps/docs/dist` |

Catatan Render yang sudah kita tahu dari pengalaman:
- static site pakai field **`publishPath`** (bukan `staticPublishPath`), dan **menolak `region`**.
- SPA fallback rule: `source: "/:path*"` → `destination: "/index.html"` (jangan `/*`).
- Free web service tidur setelah idle 15 menit → docs diberi badge “cold start”.

---

## 5. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Mirror iframe pihak ketiga mati / DM domain-locked | ranking `playable`, fallback multi-server, tombol buka tab baru |
| Signed URL rajadonghua expire | selalu fetch `/watch` fresh, cache ≤60s |
| Cloudflare/WAF di salah satu sumber | UA browser + Referer, retry 2×, tandai sumber `degraded` |
| Rate limit Render free | cache in-memory pendek + ETag di API |
| Poster hotlink-protected | `/api/img` proxy |

---

## 6. Roadmap setelah MVP
1. Watch-party / sync room (WebSocket).
2. Download manager (pilih kualitas → MP4 langsung dari rajadonghua).
3. Notifikasi episode baru (RSS/cron).
4. Profil + sinkron progress (butuh DB; Render Postgres free).
5. PWA + offline cache poster.

---

## 7. Rekomendasi jujur buat baby
- **Jangan** taruh animexin.dev sebagai sumber utama walau mirrornya paling banyak: mayoritas host-nya iframe eksternal (gdriveplayer) yang kualitas & uptime-nya di luar kendali kita, dan beberapa (Dood) memblokir IP datacenter.
- **Pakai rajadonghua sebagai “prime”** di UI (badge `PRIME · MP4`), lalu anichin/animexin sebagai “Mirror” — biar user paham kenapa ada 2 kelas sumber.
- Kalau nanti mau katalog besar + playback stabil, kombinasi terbaik: **rajadonghua (prime) + anichin (catalog)**, animexin untuk bahasa langka, yunshanid cadangan.
