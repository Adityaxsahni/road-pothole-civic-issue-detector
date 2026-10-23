import { NextResponse } from "next/server";
import { reportFiltersSchema, searchParamsToRecord } from "@/lib/validation";
import { getCurrentUser, isStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { enforceRateLimit, handleRouteError } from "@/server/http";
import { getMapPoints } from "@/server/services/queries";

/**
 * Map points. Public visitors get the default municipality's issues (no media or reporter data);
 * staff are scoped to their own municipality.
 */
export async function GET(req: Request) {
  try {
    const limited = enforceRateLimit(req, "map", 120, 60_000);
    if (limited) return limited;
    const user = await getCurrentUser();
    const filters = reportFiltersSchema.parse(searchParamsToRecord(new URL(req.url).searchParams));
    const municipalityId =
      (isStaff(user) && user?.municipalityId) ||
      (await prisma.municipality.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    const points = await getMapPoints(filters, municipalityId);
    return NextResponse.json({ points }, { headers: { "Cache-Control": "private, max-age=15" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
