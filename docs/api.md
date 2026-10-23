# HTTP API

All endpoints are same-origin JSON unless noted. Authentication uses the NextAuth session cookie; staff endpoints are scoped to the user’s municipality. Errors have the shape `{ "error": string, "fieldErrors"?: Record<string, string[]> }`.

| Method & path | Auth | Description |
| --- | --- | --- |
| `POST /api/register` | public | Create a citizen account `{ name, email, password }` |
| `POST /api/auth/callback/credentials` | public | Sign in (NextAuth) |
| `POST /api/detect` | user | AI preview: multipart `file` (image) → detection suggestion. Nothing is stored. |
| `POST /api/reports` | user | Submit a report (multipart, see below) → `201` with id, ref code, detection, dedup result |
| `GET /api/reports` | user | List reports. Staff: municipality-wide with filters. Citizens: their own. |
| `GET /api/reports/:id` | owner / staff | Report detail including media, detections, timeline (public entries only for citizens) and `relatedReportIds` |
| `GET /api/reports/export` | staff | CSV export of the filtered list |
| `GET /api/map` | public | Privacy-safe map points (no media or reporter) with the same filters |
| `GET /api/hotspots` | public | Ranked hotspot clusters |
| `GET /api/media/:key` | owner / staff | Authenticated media delivery (supports `Range`) |
| `GET /api/notifications` · `POST /api/notifications` | user | List / mark read (`{ ids?: string[] }`) |
| `GET /api/geocode/reverse?lat&lng` | user | Address lookup (when enabled) |
| `GET|POST /api/cron/recompute` | `Bearer CRON_SECRET` | Recompute hotspots and priorities, snapshot analytics |
| `GET /api/health` | public | Liveness/readiness (`503` if the database is down) |

Staff mutations (status, notes, assignment, duplicate decisions, priority recompute) are **server actions** in `server/actions/reports.ts`. They are not public HTTP endpoints.

## Submitting a report

`POST /api/reports` with `multipart/form-data`:

| Field | Type | Notes |
| --- | --- | --- |
| `media` | file (1–4) | JPEG/PNG/WebP ≤ 10 MB, MP4/WebM/MOV ≤ 50 MB |
| `poster` | file | Optional JPEG frame for video-only reports |
| `categorySlug` | string | e.g. `pothole`, `road-crack`, `blocked-drain`, `water-leak`, `trash`, `fallen-sign`, `broken-streetlight`, `open-manhole`, `other` |
| `title` | string | 4–120 chars |
| `description` | string | 10–2000 chars |
| `notes` | string | optional |
| `latitude`, `longitude` | number | required |
| `accuracyM` | number | GPS accuracy, optional |
| `address` | string | optional |
| `roadType` | enum | `HIGHWAY`, `ARTERIAL`, `COLLECTOR`, `LOCAL`, `UNKNOWN` |
| `trafficLevel` | enum | `HEAVY`, `MODERATE`, `LOW`, `UNKNOWN` |

Response (`201`):

```json
{
  "id": "cm…",
  "refCode": "CP-QRX9UE",
  "status": "NEW",
  "severity": "HIGH",
  "priorityScore": 53.4,
  "detection": { "label": "pothole", "confidence": 0.895, "boundingBox": { "x": 0.44, "y": 0.65, "w": 0.4, "h": 0.32 }, "severityScore": 74.6, "modelName": "civicvision-lite" },
  "dedup": { "status": "UNIQUE", "primaryId": null, "primaryRefCode": null, "score": null }
}
```

## List filters

Shared by `/api/reports`, `/api/reports/export`, `/api/map` and the dashboard URL:

`q`, `status` (comma-separated), `severity` (comma-separated), `category` (slugs), `neighborhood` (id), `team` (id), `dedup` (`UNIQUE|SUSPECTED|DUPLICATE`), `from`, `to` (ISO dates), `sort` (`priority|severity|newest|oldest`), `page`, `pageSize` (5–100).

## AI service contract

`POST {AI_SERVICE_URL}/detect` with multipart `file` must return:

```json
{
  "model_name": "yolo:best.pt",
  "model_version": "8.3",
  "label": "pothole",
  "confidence": 0.91,
  "bbox": { "x": 0.41, "y": 0.62, "w": 0.22, "h": 0.15 },
  "damage_area_ratio": 0.033,
  "detections": [{ "label": "pothole", "confidence": 0.91, "bbox": { "x": 0.41, "y": 0.62, "w": 0.22, "h": 0.15 } }],
  "latency_ms": 48
}
```

Bounding boxes are normalised to 0–1 with a top-left origin. `label` must be a CivicPulse category slug, or `other`.
