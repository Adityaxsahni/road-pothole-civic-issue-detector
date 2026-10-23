# Deployment

## Production checklist

- [ ] Managed PostgreSQL 14+ with backups; set `DATABASE_URL`.
- [ ] Generate a long random `NEXTAUTH_SECRET` and set `NEXTAUTH_URL` to the public HTTPS URL.
- [ ] Choose media storage: S3-compatible (`STORAGE_PROVIDER=s3`) or a persistent volume for `UPLOAD_DIR`.
- [ ] Run `npx prisma migrate deploy` on every release, before the new version takes traffic.
- [ ] Schedule `GET /api/cron/recompute` with `Authorization: Bearer $CRON_SECRET` (every 15 minutes is a good default).
- [ ] Configure alert channels (`NOTIFY_WEBHOOK_URL` for Slack or Teams; replace the email/SMS mock transports in `server/services/notifications.ts` with SES/Twilio/etc.).
- [ ] Use a tile provider with an SLA for `NEXT_PUBLIC_MAP_TILE_URL` (the public OSM servers are for light use only) and rebuild.
- [ ] Do **not** run `npm run db:seed` against production; it wipes data and refuses unless `SEED_FORCE=true`.
- [ ] Leave `SHOW_DEMO_ACCOUNTS` unset in production.
- [ ] For more than one app instance, move rate limiting to Redis (`lib/rate-limit.ts`) and rely on the cron job for hotspot refreshes.
- [ ] Create staff accounts. Self-registration only creates citizens; promote users with Prisma Studio or SQL (`UPDATE "User" SET role='STAFF', "teamId"=… WHERE email=…`).

## Docker

```bash
docker build -t civicpulse --target runner \
  --build-arg NEXT_PUBLIC_MAP_TILE_URL="https://tile.openstreetmap.org/{z}/{x}/{y}.png" .
docker run -p 3000:3000 \
  -e DATABASE_URL=… -e NEXTAUTH_SECRET=… -e NEXTAUTH_URL=https://… \
  -v civicpulse-uploads:/app/storage/uploads civicpulse
```

Run migrations from the `builder` target (it contains the Prisma CLI):

```bash
docker build -t civicpulse-tools --target builder .
docker run --rm -e DATABASE_URL=… civicpulse-tools npx prisma migrate deploy
```

`docker-compose.yml` wires this together locally: `db` → `migrate` (migrate and seed if empty) → `web`, plus the optional `ai` profile.

## Render / Railway / Fly.io

1. Create a PostgreSQL instance and copy its connection string.
2. Deploy from the repository using the `Dockerfile` (target `runner`).
3. Add a persistent disk mounted at `/app/storage/uploads`, or configure S3.
4. Set the pre-deploy/release command to `npx prisma migrate deploy` (use the `builder` target or a one-off job).
5. Add a cron job, or the platform scheduler, that calls `/api/cron/recompute` with the bearer secret.
6. Optionally deploy `ai-service/` as a second service and set `AI_SERVICE_URL` to its internal URL.

## Vercel

1. Import the repository. Build command: `npm run build` (runs `prisma generate`).
2. Set environment variables, including `STORAGE_PROVIDER=s3` and the `S3_*` values. The serverless filesystem is ephemeral, so local storage won’t persist.
3. Run `npx prisma migrate deploy` from CI or locally against the production database.
4. `vercel.json` already schedules `/api/cron/recompute` every 15 minutes. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set.
5. Host the YOLO service elsewhere (GPU instance, Render, Fly.io) if you need learned detection.

## AI service with YOLO weights

```bash
cd ai-service
pip install -r requirements-yolo.txt
YOLO_WEIGHTS=weights/best.pt uvicorn app.main:app --port 8000
# or: docker compose --profile ai up --build  (INSTALL_YOLO=true to bake in PyTorch)
```

Use any Ultralytics-compatible road-damage model, for example one trained on RDD2022 (classes `D00`/`D10`/`D20`/`D40`) or a pothole dataset. Class names are mapped to categories in `ai-service/app/detector.py` (`LABEL_MAP`). Without weights the service runs its NumPy heuristic.
