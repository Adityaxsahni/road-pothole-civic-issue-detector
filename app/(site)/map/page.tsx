import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/map-explorer";
import { isStaff } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Issue map" };
export const dynamic = "force-dynamic";

export default async function PublicMapPage() {
  const [user, municipality, categories] = await Promise.all([
    getCurrentUser(),
    prisma.municipality.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.issueCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      <h1 className="sr-only">Map of reported civic issues</h1>
      <MapExplorer
        categories={categories}
        center={[municipality?.centerLat ?? 12.9716, municipality?.centerLng ?? 77.6146]}
        zoom={municipality?.defaultZoom ?? 12}
        linkBase={isStaff(user) ? "/dashboard/reports/" : undefined}
        className="flex-1"
      />
    </main>
  );
}
