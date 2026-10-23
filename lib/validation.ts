import { z } from "zod";
import { STATUSES, SEVERITIES } from "./constants";
import { isValidCoordinate } from "./geo";
import { sanitizeText } from "./utils";

const text = (min: number, max: number, multiline = false) =>
  z
    .string()
    .transform((s) => sanitizeText(s, { multiline }))
    .pipe(z.string().min(min).max(max));

const optionalText = (max: number, multiline = false) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((s) => (s ? sanitizeText(s, { multiline }) : undefined))
    .pipe(z.string().max(max).optional());

export const roadTypeSchema = z.enum(["HIGHWAY", "ARTERIAL", "COLLECTOR", "LOCAL", "UNKNOWN"]);
export const trafficLevelSchema = z.enum(["HEAVY", "MODERATE", "LOW", "UNKNOWN"]);
export const statusSchema = z.enum(STATUSES as [string, ...string[]]);
export const severitySchema = z.enum(SEVERITIES as [string, ...string[]]);

export const createReportSchema = z
  .object({
    categorySlug: z.string().regex(/^[a-z0-9-]{2,40}$/, "Choose an issue category"),
    title: text(4, 120),
    description: text(10, 2000, true),
    notes: optionalText(2000, true),
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
    accuracyM: z.coerce.number().min(0).max(100_000).optional(),
    address: optionalText(300),
    roadType: roadTypeSchema.default("UNKNOWN"),
    trafficLevel: trafficLevelSchema.default("UNKNOWN"),
  })
  .refine((v) => isValidCoordinate(v.latitude, v.longitude), {
    message: "A valid location is required",
    path: ["latitude"],
  });
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const registerSchema = z.object({
  name: text(2, 80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include a letter")
    .regex(/[0-9]/, "Include a number"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(128),
});

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      v == null ? [] : (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean),
    )
    .pipe(z.array(item));

const dateParam = z
  .string()
  .optional()
  .transform((v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : undefined));

export const reportFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  status: csv(statusSchema),
  severity: csv(severitySchema),
  category: csv(z.string().regex(/^[a-z0-9-]{2,40}$/)),
  neighborhood: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v || undefined),
  team: z
    .string()
    .max(40)
    .optional()
    .transform((v) => v || undefined),
  dedup: z
    .enum(["UNIQUE", "SUSPECTED", "DUPLICATE"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  from: dateParam,
  to: dateParam,
  sort: z.enum(["priority", "newest", "oldest", "severity"]).default("priority"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Convert URLSearchParams / Next searchParams into a plain record understood by the filter schema. */
export function searchParamsToRecord(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const entries =
    params instanceof URLSearchParams
      ? [...params.keys()].map((k) => [k, params.getAll(k)] as const)
      : Object.entries(params);
  for (const [key, value] of entries) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? (value.length === 1 ? value[0] : [...value]) : value;
  }
  return out;
}

export const updateStatusSchema = z.object({
  reportId: z.string().cuid(),
  status: statusSchema,
  note: optionalText(1000, true),
  isPublic: z.boolean().default(true),
});

export const addNoteSchema = z.object({
  reportId: z.string().cuid(),
  note: text(1, 2000, true),
  isPublic: z.boolean().default(false),
});

export const assignSchema = z.object({
  reportId: z.string().cuid(),
  teamId: z.string().cuid(),
  assigneeId: z.string().cuid().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  note: optionalText(1000, true),
});

export const duplicateDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("confirm"), reportId: z.string().cuid(), primaryId: z.string().cuid() }),
  z.object({ decision: z.literal("dismiss"), reportId: z.string().cuid() }),
  z.object({ decision: z.literal("unlink"), reportId: z.string().cuid() }),
]);
