import "server-only";
import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters").optional(),
  ALLOW_PUBLIC_REGISTRATION: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  S3_PREFIX: z.string().optional(),
  MAX_IMAGE_MB: z.coerce.number().positive().max(50).default(10),
  MAX_VIDEO_MB: z.coerce.number().positive().max(500).default(50),
  AI_SERVICE_URL: z
    .string()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, "") : undefined))
    .pipe(z.string().url().optional()),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  DEDUP_RADIUS_M: z.coerce.number().positive().max(1000).default(60),
  DEDUP_WINDOW_DAYS: z.coerce.number().positive().max(365).default(30),
  URGENT_PRIORITY_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
  NOTIFY_WEBHOOK_URL: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().url().optional()),
  NOTIFY_EMAIL_TO: z.string().optional().default(""),
  NOTIFY_SMS_TO: z.string().optional().default(""),
  CRON_SECRET: z.string().optional(),
  ENABLE_REVERSE_GEOCODING: bool,
  GEOCODER_USER_AGENT: z.string().default("CivicPulse/1.0"),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

/** Validated server-side configuration. Never import this from client components. */
export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid server environment:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
