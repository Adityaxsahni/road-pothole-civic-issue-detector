import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/server/auth";
import { prisma } from "@/server/db";
import { handleRouteError } from "@/server/http";
import { getHotspots } from "@/server/services/analytics";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const municipalityId =
      (isStaff(user) && user?.municipalityId) ||
      (await prisma.municipality.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    if (!municipalityId) return NextResponse.json({ hotspots: [] });
    const hotspots = await getHotspots(municipalityId, 25);
    return NextResponse.json({
      hotspots: hotspots.map((h) => ({
        id: h.id,
        rank: h.rank,
        label: h.label,
        centerLat: h.centerLat,
        centerLng: h.centerLng,
        radius: h.radius,
        issueCount: h.issueCount,
        openCount: h.openCount,
        severityScore: h.severityScore,
        riskScore: h.riskScore,
        recommendedAction: h.recommendedAction,
        category: h.dominantCategory?.slug ?? null,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
