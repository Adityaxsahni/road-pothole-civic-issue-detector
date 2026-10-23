# CivicPulse — Road Pothole & Civic Issue Detector

CivicPulse is a citizen-reporting and city-operations platform. Residents report potholes and other civic issues from their phone in under a minute; AI classifies the problem and estimates severity, duplicates are merged automatically, and city staff work from a ranked, explainable priority queue with hotspot maps and analytics.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/PostgreSQL-Prisma-336791) ![stack](https://img.shields.io/badge/AI-YOLO%20%7C%20built--in-1d4ed8)

## Key features

| Area | What you get |
| --- | --- |
| **Citizen reporting** | Mobile-first 5-step wizard: camera/photo/video upload (on-device compression, video frame extraction), live AI suggestion with bounding box, category confirm/override, GPS with tap-to-adjust map pin, road/traffic context, voice dictation, upload progress and a confirmation screen with reference number. |
| **AI detection** | Pluggable detector: a FastAPI **YOLO** service (`ai-service/`) when configured, otherwise the built-in **CivicVision-Lite** classical-vision analyser. Produces label, confidence, bounding box, damage-area ratio and a severity estimate. AI output is stored per image and shown to staff, including whether the citizen confirmed or overrode it. |
| **Deduplication** | Scores candidates by GPS proximity, time window, perceptual image hash (dHash) and category agreement. High scores auto-merge (corroboration boosts the primary’s priority); borderline scores are flagged for staff to confirm, dismiss or unmerge. |
| **Priority & hotspots** | Explainable 0–100 priority from severity, traffic, road class, AI confidence, geographic risk, historical density, citizen corroboration and SLA pressure. DBSCAN hotspot clustering ranks problem corridors and recommends interventions. |
| **City dashboard** | KPIs, priority queue, hotspot regions, category and severity breakdowns, recent feed; filterable queue (status, severity, category, neighbourhood, team, dedup state, date range, search) with CSV export; report detail with evidence, AI panel, priority breakdown, dedup tools, crew assignment, status workflow, optimistic notes and full audit timeline. |
| **Maps & analytics** | Leaflet maps with severity-coloured clustering, heatmap mode and hotspot overlays. Weekly trends, severity distribution, resolved vs unresolved by neighbourhood, open-backlog snapshots, repeat problem zones and recommended action areas. |
| **Notifications** | Urgent alerts (priority ≥ threshold or critical severity) to in-app, mock email/SMS and a Slack-compatible webhook; citizens get in-app status updates. |
| **Security** | Role-based access (citizen/staff/admin) enforced in the proxy, pages, API routes and server actions; magic-byte upload validation, image re-encoding (strips EXIF/GPS metadata); authenticated media delivery; zod validation and input sanitisation; rate limiting; CSP and security headers; CSV formula-injection protection; secrets server-side only. |

## Quick start

Requirements: **Node.js 22+**. No Docker or external database required for the demo.

```bash
npm install
npm run demo
```

`npm run demo` creates `.env` with fresh secrets, starts an embedded PostgreSQL (port 5433, data in `.data/pg`), applies migrations, seeds demo data on first run and starts the app at **http://localhost:3000**.

> npm 11+ asks you to approve dependency install scripts. They are pre-approved in `package.json#allowScripts` (Prisma, esbuild and the embedded Postgres binaries).

### Demo accounts

All demo accounts use the password **`Password123!`**. The sign-in page has one-click buttons for them outside production.

| Role | Email | Use it to |
| --- | --- | --- |
| City admin | `admin@civicpulse.dev` | Full dashboard, analytics, alerts |
| Field staff | `staff@civicpulse.dev` | Triage and resolve as a road crew lead |
| Citizen | `citizen@civicpulse.dev` | Report issues, track your reports |

The seed creates a demo city (Bengaluru) with 13 neighbourhoods, 5 maintenance teams, about 300 reports over 120 days with synthetic photos analysed by the real detector, deduplication, status histories, 10 hotspots and 90 days of analytics snapshots.

### Other ways to run

**Docker (full stack):**

```bash
docker compose up --build                 # db + migrations/seed + web on :3000
docker compose --profile ai up --build    # also start the YOLO service on :8000
# then set AI_SERVICE_URL=http://ai:8000 (e.g. in a .env next to docker-compose.yml)
```

**Your own PostgreSQL:**

```bash
cp .env.example .env          # set DATABASE_URL
npm run setup                 # generate client, migrate, seed if empty
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run demo` | One command: embedded Postgres, migrate, seed (if empty), dev server |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / run the standalone server locally |
| `npm run db:start` | Run the embedded PostgreSQL on its own (foreground) |
| `npm run setup` | Prepare an existing database (migrate + seed if empty) |
| `npm run db:migrate` | Create/apply a new migration in development |
| `npm run db:seed` | Reset and reseed demo data (**wipes the database**) |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; needs a seeded database) |

First time running the e2e suite? Install the browser with `npx playwright install chromium`.

## Environment variables

Every variable is documented in [`.env.example`](.env.example). Only variables prefixed with `NEXT_PUBLIC_` reach the browser.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | Session signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ✅ | Public base URL of the app |
| `ALLOW_PUBLIC_REGISTRATION` | | Allow citizen self-sign-up (default `true`) |
| `STORAGE_PROVIDER` | | `local` (default) or `s3` |
| `UPLOAD_DIR` | | Local media directory (default `./storage/uploads`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX` | | S3-compatible storage (AWS S3, R2, MinIO, Supabase) |
| `MAX_IMAGE_MB`, `MAX_VIDEO_MB` | | Upload limits (10 / 50) |
| `AI_SERVICE_URL`, `AI_SERVICE_TIMEOUT_MS` | | YOLO service; empty uses the built-in analyser |
| `DEDUP_RADIUS_M`, `DEDUP_WINDOW_DAYS` | | Duplicate search radius and window (60 m / 30 days) |
| `URGENT_PRIORITY_THRESHOLD` | | Priority that triggers urgent alerts (75) |
| `NOTIFY_WEBHOOK_URL`, `NOTIFY_EMAIL_TO`, `NOTIFY_SMS_TO` | | Alert channels (webhook is Slack-compatible; email/SMS are logged mocks) |
| `CRON_SECRET` | | Bearer token for `/api/cron/recompute` |
| `ENABLE_REVERSE_GEOCODING`, `GEOCODER_USER_AGENT` | | Server-side Nominatim address lookup (off by default) |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | | Map tiles (OpenStreetMap by default, no key) |
| `SHOW_DEMO_ACCOUNTS` | | Show demo login buttons in production builds |

## Project structure

```
app/                  Next.js App Router
  (site)/             Public + citizen pages: landing, map, login/register, report wizard, my reports
  dashboard/          Staff console: overview, queue, report detail, operations map, analytics, alerts
  api/                Route handlers: reports, detect, map, hotspots, media, export, notifications, cron, health
components/           UI: ui/ (shadcn-style primitives), map/, charts/, dashboard/, reports/, report-wizard/
lib/                  Pure domain logic: scoring, dedup, clustering, geo, phash, analytics, validation, csv
server/               Server-only code: auth, db, env, storage (local/S3), media processing, AI, services, actions
prisma/               Schema, migrations, seed
ai-service/           FastAPI + YOLO inference service (optional)
scripts/              demo/setup/start helpers and the embedded Postgres runner
tests/unit, tests/e2e Vitest unit tests and Playwright end-to-end tests
docs/                 Architecture, API reference, deployment guide
```

## Testing

* **Unit (62 tests):** scoring and severity, the dedup engine, DBSCAN and hotspots, geo helpers, perceptual hashing, analytics snapshots and repeat zones, CSV escaping, rate limiting, validation, file-type sniffing, image normalisation (metadata stripping) and detector accuracy on synthetic scenes.
* **End-to-end (9 tests):** the landing page and map; route protection; the full citizen wizard on desktop and a Pixel 7 profile (AI suggestion → category → mocked GPS → validation → submit → confirmation); dashboard KPIs; queue filtering, triage notes and resolving; CSV export; analytics.
* **AI service:** `cd ai-service && pip install -r requirements-dev.txt && pytest`.

## Deployment

See [docs/deployment.md](docs/deployment.md) for Docker, Render/Railway/Fly.io and Vercel instructions, the production checklist and scheduled jobs. In short:

* **Docker:** the `Dockerfile` produces a small standalone image; run `prisma migrate deploy` before starting.
* **Vercel:** set `STORAGE_PROVIDER=s3` (the filesystem is ephemeral). `vercel.json` schedules the recompute cron.
* **Render/Railway:** use the Dockerfile with a persistent disk mounted at `/app/storage/uploads`, or use S3.

## Design decisions

* **No PostGIS dependency.** Spatial queries use indexed latitude/longitude bounding boxes plus haversine in the application. This keeps setup to plain Postgres. At large scale, swap in PostGIS `ST_DWithin`; the queries live in `server/services/dedup.ts` and `priority.ts`.
* **AI always available.** The remote detector has a timeout and falls back to the built-in analyser, so report submission never blocks on model availability.
* **Explainability over magic numbers.** Every priority score stores its factor breakdown, and staff see why an issue ranks where it does.
* **Privacy by default.** Photos are re-encoded without metadata and served only to the reporter and staff. The public map exposes no media or reporter identity.

See [docs/architecture.md](docs/architecture.md) for the data model, pipelines and scoring formulas.

## Troubleshooting

* **`Can't reach database server`:** start the database with `npm run demo` or `npm run db:start`, or point `DATABASE_URL` at your Postgres.
* **Turbopack panic / `exit code 0xc0000142` on Windows after a crashed dev server:** stop stray `node` processes and delete `.next/`, then restart.
* **`EPERM ... query_engine-windows.dll.node` during install:** a running dev server locks Prisma's engine. Stop it and run `npx prisma generate`.
* **Map tiles missing:** check that `NEXT_PUBLIC_MAP_TILE_URL` is allowed by the CSP. The origin is derived automatically in `next.config.ts`. Rebuild after changing `NEXT_PUBLIC_*` values.
