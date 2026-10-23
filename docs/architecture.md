# Architecture

## Overview

```
 Citizen (mobile web)            City staff (desktop/tablet)
        │                                   │
        ▼                                   ▼
┌───────────────────────── Next.js 16 (App Router) ─────────────────────────┐
│ proxy.ts (route guard) → Server Components / Route Handlers / Actions     │
│                                                                            │
│  server/services                                                           │
│   reports.ts  ─ submission pipeline, triage (status, assign, notes)        │
│   dedup.ts    ─ candidate search + merge/unmerge                           │
│   priority.ts ─ context gathering + recompute                              │
│   hotspots.ts ─ DBSCAN clustering → HotspotCluster                         │
│   analytics.ts─ dashboard/analytics queries, daily snapshots               │
│   notifications.ts ─ in-app / email / SMS / webhook fan-out                │
│                                                                            │
│  lib/ (pure, unit-tested): scoring · dedup · clustering · geo · phash ·    │
│        analytics · validation · csv · rate-limit                           │
└──────────────┬───────────────────────────┬─────────────────┬──────────────┘
               │                           │                 │
        PostgreSQL (Prisma)      Storage (local FS / S3)   AI detector
                                                       ├─ ai-service (FastAPI + YOLO)
                                                       └─ CivicVision-Lite (in-process fallback)
```

## Report submission pipeline

`POST /api/reports` → `createReport()` in `server/services/reports.ts`:

1. **Validate.** zod schema (sanitised text, coordinate bounds), 1–4 files, magic-byte sniffing (`server/media/file-type.ts`) and size limits.
2. **Normalise media.** sharp auto-rotates the image, resizes it to at most 2048 px, re-encodes it as JPEG (dropping all EXIF, including GPS), creates a 480 px WebP thumbnail and computes a 64-bit dHash. Videos are stored as-is; the wizard sends a client-extracted poster frame for analysis.
3. **AI analysis.** `analyzeImage()` calls the remote YOLO service (timeout `AI_SERVICE_TIMEOUT_MS`) or falls back to the built-in analyser. The most confident non-"other" result represents the report.
4. **Severity.** `computeSeverity()` (see below) combines the category hazard with the detected damage area and confidence. If the AI disagrees with the citizen’s category group, its damage estimate is ignored.
5. **Deduplication.** `detectDuplicate()` loads candidates from an indexed bounding-box and time-window query, then scores them (see below).
6. **Priority.** `computePriority()` runs with context such as nearby density, risk ratio and hotspot membership.
7. **Persist in one transaction.** Writes the report, media assets, detection results and timeline entries (CREATED, AI_ANALYSIS, DUPLICATE), then merges or flags duplicates.
8. **Background work.** Recomputes the primary’s priority after a merge, raises urgent alerts when the threshold is crossed, and schedules a debounced hotspot recompute.

Stored files are cleaned up if any step fails.

## Data model

| Model | Purpose |
| --- | --- |
| `Municipality`, `Neighborhood` | Tenant city and areas (reports are assigned to the nearest centroid within its radius) |
| `User` (`CITIZEN`/`STAFF`/`ADMIN`) | Accounts; staff belong to a `Team` |
| `IssueCategory` | Slug, base severity, SLA hours, dedup group, icon/colour |
| `Report` | Core entity: status, severity, `severityScore`, `priorityScore` + `priorityBreakdown` (JSON), AI fields (`confidence`, `aiSuggestedCategoryId`, `aiAccepted`), location, road/traffic context, dedup fields (`dedupStatus`, `duplicateOfId`, `duplicateGroupId`, `duplicateScore`, `duplicateCount`) |
| `MediaAsset` | Stored file metadata, thumbnail, perceptual hash |
| `DetectionResult` | Per-image model output: label, confidence, bounding box, severity, damage ratio, latency, raw features |
| `DuplicateGroup` | Primary report and reason; related reports via relation (`relatedReportIds` in the API) |
| `StatusLog` | Activity timeline (status changes, notes, assignments, AI, dedup, alerts), with public/internal visibility |
| `TeamAssignment` | Crew assignment history with due date and completion |
| `HotspotCluster` | Ranked clusters with centre, radius, counts, risk and recommended action |
| `AnalyticsSummary` | Daily point-in-time snapshots (backlog, new, resolved, duplicates, distributions) |
| `Notification` | Alert and update log per channel with delivery status |

Report statuses: `NEW → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED`, plus `REJECTED` and `DUPLICATE`. Allowed manual transitions are listed in `lib/constants.ts` (`STATUS_TRANSITIONS`).

## Scoring formulas

### Severity (`lib/scoring.ts`)

```
damage     = clamp(√damageAreaRatio / 0.6)          # 36% of frame → 1
adjustment = (damage − 0.4) × 60 × (0.4 + 0.6 × confidence)
severity   = clamp(categoryBase + adjustment, 0, 100)
level      = ≥80 CRITICAL · ≥60 HIGH · ≥35 MEDIUM · else LOW
```

### Priority (0–100, explainable)

| Factor | Weight | Normalisation |
| --- | --- | --- |
| Damage severity | 0.34 | severityScore / 100 |
| Traffic impact | 0.14 | heavy 1 · moderate 0.6 · light 0.25 · unknown 0.5 |
| Road class | 0.12 | highway 1 · arterial 0.8 · collector 0.6 · local 0.35 |
| Detection confidence | 0.05 | AI confidence (0.5 if none) |
| Geographic risk | 0.10 | 0.7 × share of HIGH/CRITICAL issues within 500 m (1 yr) + 0.3 if inside a hotspot |
| Historical density | 0.10 | log-saturating count of reports within 250 m (180 days), 20 → 1 |
| Citizen corroboration | 0.08 | log-saturating merged duplicates, 5 → 1 |
| SLA pressure | 0.07 | hours open / category SLA |

Bands: P1 ≥ 75 (urgent alert), P2 ≥ 55, P3 ≥ 35, P4 below. A cron job recomputes open reports so SLA pressure grows over time.

### Duplicate score (`lib/dedup.ts`)

Hard gates: distance ≤ `DEDUP_RADIUS_M`, time difference ≤ `DEDUP_WINDOW_DAYS`, same category group, candidate not rejected and not resolved before the new report.

```
geo   = 1 − distance / radius
time  = 1 − (Δt / window)^1.5
image = best dHash similarity (≤6 bits → 1, ≥28 bits → 0)
cat   = 1 exact · 0.5 same group
score = 0.45·geo + 0.15·time + 0.25·image + 0.15·cat     (with photos)
      = 0.55·geo + 0.20·time + 0.25·cat                  (no photos)
≥ 0.80 → auto-merge (DUPLICATE) · ≥ 0.60 → flag (SUSPECTED)
```

Matching a merged duplicate links to its primary, so groups never chain. Resolving a primary notifies everyone whose report was merged into it.

### Hotspots (`lib/clustering.ts`)

DBSCAN (eps 200 m, minPts 3, grid-indexed) over unique, non-rejected reports from the last 180 days.

```
risk = 0.45·avgSeverity + 0.35·volume·100 + 0.2·openShare·100
volume = log(1+n)/log(31)
```

Recommended actions depend on the dominant category and cluster size, for example resurfacing for large pothole corridors or desilting for drain clusters.

## AI detection

* `server/ai/index.ts` picks the remote service when configured and falls back on any error or timeout.
* `server/ai/heuristic.ts` (**CivicVision-Lite**) segments the lower road region for compact dark cavities (potholes), thin elongated dark strokes (cracks), saturated blue regions (water), and high colour-diversity clutter (dumping, or debris in water for blocked drains). It is a transparent baseline, not a learned model. Its accuracy is verified on synthetic scenes in `tests/unit/media-ai.test.ts`.
* `ai-service/` serves Ultralytics YOLO with a class-to-category map (supports RDD2022 `D00/D10/D20/D40`, pothole and crack datasets) and the same response contract.

## Security model

* **Authentication:** NextAuth credentials with JWT sessions, bcrypt hashing, uniform-time failed logins and failed-attempt throttling.
* **Authorisation:** `proxy.ts` redirects early; every page (`requireUser`), route handler (`assertUser`) and server action re-checks the role and municipality scope.
* **Uploads:** magic-byte sniffing (not the client MIME type), size limits, sharp `limitInputPixels`, full re-encode, private storage behind `/api/media` with per-report access checks and range support.
* **Output:** React escaping; map popups built with DOM APIs (never `innerHTML`); CSV export neutralises formula injection.
* **Headers:** CSP (tile origin derived from config), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
* **Abuse controls:** in-memory rate limiting for report creation, AI preview, registration, export, map and geocoding (swap the store for Redis in multi-instance deployments).
