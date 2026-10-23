import { NextResponse } from "next/server";
import { MAX_MEDIA_FILES } from "@/lib/constants";
import { createReportSchema, reportFiltersSchema, searchParamsToRecord } from "@/lib/validation";
import { assertUser } from "@/server/auth";
import { enforceRateLimit, handleRouteError, jsonError, toUploadedFile } from "@/server/http";
import { listReports } from "@/server/services/queries";
import { createReport, type UploadedFile } from "@/server/services/reports";

export const runtime = "nodejs";

/** List reports: staff see their municipality (filterable); citizens see their own. */
export async function GET(req: Request) {
  try {
    const user = await assertUser();
    const filters = reportFiltersSchema.parse(searchParamsToRecord(new URL(req.url).searchParams));
    return NextResponse.json(await listReports(user, filters));
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Submit a report (multipart/form-data with `media` files and report fields). */
export async function POST(req: Request) {
  try {
    const user = await assertUser();
    const limited = enforceRateLimit(req, "create-report", 20, 60 * 60_000, user.id);
    if (limited) return limited;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) return jsonError("Expected multipart/form-data", 415);
    const form = await req.formData();

    const fields = Object.fromEntries(
      [
        "categorySlug",
        "title",
        "description",
        "notes",
        "latitude",
        "longitude",
        "accuracyM",
        "address",
        "roadType",
        "trafficLevel",
      ]
        .map((k) => [k, form.get(k)])
        .filter(([, v]) => typeof v === "string" && v !== ""),
    );
    const parsed = createReportSchema.safeParse(fields);
    if (!parsed.success) {
      return jsonError("Please fix the highlighted fields", 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const entries = form.getAll("media");
    if (entries.length > MAX_MEDIA_FILES)
      return jsonError(`You can attach up to ${MAX_MEDIA_FILES} files`, 400);
    const files = (await Promise.all(entries.map(toUploadedFile))).filter((f): f is UploadedFile => !!f);
    const poster = await toUploadedFile(form.get("poster"));

    const result = await createReport({ user, input: parsed.data, files, poster });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
