import type { Metadata } from "next";
import { ReportWizard } from "@/components/report-wizard/report-wizard";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: "Report an issue" };

export default async function ReportPage() {
  const user = await requireUser({ callbackUrl: "/report" });
  const [categories, municipality] = await Promise.all([
    prisma.issueCategory.findMany({
      where: { active: true },
      orderBy: { baseSeverity: "desc" },
      select: { slug: true, name: true, description: true, icon: true, color: true },
    }),
    user.municipalityId
      ? prisma.municipality.findUnique({ where: { id: user.municipalityId } })
      : prisma.municipality.findFirst({ orderBy: { createdAt: "asc" } }),
  ]);
  // Keep "Other" last regardless of severity ordering.
  categories.sort((a, b) => Number(a.slug === "other") - Number(b.slug === "other"));
  return (
    <main className="flex flex-1 flex-col">
      <ReportWizard
        categories={categories}
        center={[municipality?.centerLat ?? 12.9716, municipality?.centerLng ?? 77.6146]}
      />
    </main>
  );
}
