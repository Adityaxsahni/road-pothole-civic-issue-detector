import { toCsv } from "@/lib/csv";
import { reportFiltersSchema, searchParamsToRecord } from "@/lib/validation";
import { assertUser } from "@/server/auth";
import { enforceRateLimit, handleRouteError } from "@/server/http";
import { getExportRows } from "@/server/services/queries";

export const runtime = "nodejs";

const COLUMNS = [
  { key: "ref", header: "Reference" },
  { key: "title", header: "Title" },
  { key: "category", header: "Category" },
  { key: "status", header: "Status" },
  { key: "severity", header: "Severity" },
  { key: "severityScore", header: "Severity score" },
  { key: "priorityScore", header: "Priority score" },
  { key: "aiConfidence", header: "AI confidence" },
  { key: "latitude", header: "Latitude" },
  { key: "longitude", header: "Longitude" },
  { key: "address", header: "Address" },
  { key: "neighborhood", header: "Neighbourhood" },
  { key: "roadType", header: "Road type" },
  { key: "trafficLevel", header: "Traffic" },
  { key: "dedupStatus", header: "Dedup status" },
  { key: "duplicateOf", header: "Duplicate of" },
  { key: "duplicateCount", header: "Merged duplicates" },
  { key: "team", header: "Assigned team" },
  { key: "createdAt", header: "Created at" },
  { key: "resolvedAt", header: "Resolved at" },
] as const;

/** CSV export of the current dashboard filter (staff only). */
export async function GET(req: Request) {
  try {
    const user = await assertUser({ staff: true });
    const limited = enforceRateLimit(req, "export", 30, 60 * 60_000, user.id);
    if (limited) return limited;
    const filters = reportFiltersSchema.parse(searchParamsToRecord(new URL(req.url).searchParams));
    const rows = await getExportRows(user, filters);
    const csv = toCsv(
      rows,
      COLUMNS as unknown as Array<{ key: keyof (typeof rows)[number]; header: string }>,
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="civicpulse-reports-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
