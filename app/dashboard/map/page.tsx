import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/map-explorer";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveMunicipalityId } from "@/server/services/municipality";

export const metadata: Metadata = { title: "Operations map" };

export default async function DashboardMapPage() {
  const user = await requireUser({ staff: true });
  const municipalityId = await resolveMunicipalityId(user);
  const [municipality, categories] = await Promise.all([
    municipalityId ? prisma.municipality.findUnique({ where: { id: municipalityId } }) : null,
    prisma.issueCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  return (
    <main className="flex h-[calc(100dvh-4rem)] flex-col">
      <h1 className="sr-only">Operations map</h1>
      <MapExplorer
        categories={categories}
        center={[municipality?.centerLat ?? 12.9716, municipality?.centerLng ?? 77.6146]}
        zoom={municipality?.defaultZoom ?? 12}
        linkBase="/dashboard/reports/"
        showList
        className="flex-1"
      />
    </main>
  );
}
