import { Download, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BacklogChart } from "@/components/charts/backlog-chart";
import { SeverityChart } from "@/components/charts/severity-chart";
import { ResolvedStackedBars } from "@/components/charts/stacked-bars";
import { TrendChart } from "@/components/charts/trend-chart";
import { HotspotList } from "@/components/dashboard/hotspot-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/server/auth";
import {
  getBacklogSeries,
  getHotspots,
  getNeighborhoodStats,
  getOverviewStats,
  getRepeatZones,
  getSeverityDistribution,
  getWeeklyTrend,
} from "@/server/services/analytics";
import { resolveMunicipalityId } from "@/server/services/municipality";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<string, string> = {
  road: "Road surface",
  water: "Drainage & water",
  sanitation: "Sanitation",
  "street-furniture": "Signage & lighting",
  other: "Other",
};

export default async function AnalyticsPage() {
  const user = await requireUser({ staff: true });
  const municipalityId = await resolveMunicipalityId(user);
  if (!municipalityId) return <p className="p-6">No municipality configured.</p>;

  const [stats, trend, severity, neighborhoods, hotspots, repeatZones, backlog] = await Promise.all([
    getOverviewStats(municipalityId),
    getWeeklyTrend(municipalityId, 12),
    getSeverityDistribution(municipalityId),
    getNeighborhoodStats(municipalityId),
    getHotspots(municipalityId, 10),
    getRepeatZones(municipalityId, 8),
    getBacklogSeries(municipalityId, 60),
  ]);
  const busiest = neighborhoods.filter((n) => n.count > 0);
  const actionAreas = hotspots.filter((h) => h.openCount > 0).slice(0, 4);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Civic intelligence"
        description="Trends, distributions and problem clusters for infrastructure planning."
        actions={
          <Button asChild variant="outline">
            <a href="/api/reports/export" download>
              <Download /> Export all data
            </a>
          </Button>
        }
      />

      {actionAreas.length > 0 && (
        <section
          aria-labelledby="actions"
          className="to-card rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 p-5"
        >
          <h2 id="actions" className="font-semibold">
            Recommended action areas
          </h2>
          <p className="text-muted-foreground text-sm">
            Highest-risk clusters with unresolved issues, and the intervention most likely to fix them for
            good.
          </p>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {actionAreas.map((h) => (
              <li key={h.id} className="bg-card rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    #{h.rank} {h.label}
                  </p>
                  <span className="tabular text-muted-foreground text-xs">
                    risk <span className="text-foreground font-semibold">{Math.round(h.riskScore)}</span>
                  </span>
                </div>
                <p className="mt-1 text-sm">{h.recommendedAction}</p>
                <p className="text-muted-foreground mt-2 text-xs">
                  {h.openCount} open of {h.issueCount} issues within {Math.round(h.radius)} m · avg severity{" "}
                  {Math.round(h.severityScore)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Issue trend</CardTitle>
            <CardDescription>
              New vs resolved issues per week (last 12 weeks, duplicates excluded)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Severity distribution</CardTitle>
            <CardDescription>Currently open issues</CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityChart data={severity} />
            <p className="text-muted-foreground mt-2 text-xs">
              Resolution rate {Math.round(stats.resolutionRate * 100)}% · {stats.merged} duplicate reports
              merged
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resolved vs unresolved by neighbourhood</CardTitle>
            <CardDescription>Unique issues reported, all time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResolvedStackedBars
              data={busiest.map((n) => ({ name: n.name, open: n.open, resolved: n.resolved }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open backlog</CardTitle>
            <CardDescription>Daily snapshot (last 60 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <BacklogChart data={backlog} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Hotspots by neighbourhood</CardTitle>
            <CardDescription>Ranked by open issues; risk from the highest-ranked cluster</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Neighbourhood</TableHead>
                <TableHead className="text-right">Open</TableHead>
                <TableHead className="text-right">Resolved</TableHead>
                <TableHead className="text-right">Avg sev.</TableHead>
                <TableHead className="pr-5 text-right">Hotspots</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {busiest.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="pl-5 font-medium">
                    <Link href={`/dashboard/reports?neighborhood=${n.id}`} className="hover:text-primary">
                      {n.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-right">{n.open}</TableCell>
                  <TableCell className="tabular text-right">{n.resolved}</TableCell>
                  <TableCell className="tabular text-right">{Math.round(n.avgSeverity)}</TableCell>
                  <TableCell className="tabular pr-5 text-right">
                    {n.hotspots > 0 ? (
                      <span>
                        {n.hotspots}{" "}
                        <span className="text-muted-foreground text-xs">(risk {Math.round(n.maxRisk)})</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="text-muted-foreground size-4" aria-hidden /> Repeat problem zones
            </CardTitle>
            <CardDescription>
              Places where a fixed issue came back within 75 m — candidates for a durable repair
            </CardDescription>
          </CardHeader>
          {repeatZones.length === 0 ? (
            <p className="text-muted-foreground px-5 pb-6 text-sm">
              No recurrences detected in the last 12 months.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {repeatZones.map((z) => (
                <li key={z.reportId}>
                  <Link
                    href={`/dashboard/reports/${z.reportId}`}
                    className="hover:bg-muted/60 flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {z.neighborhood ?? "Unmapped area"} ·{" "}
                        {GROUP_LABEL[z.categoryGroup] ?? z.categoryGroup}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Originally <span className="font-mono">{z.refCode}</span> ({z.categoryName})
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-orange-600/25 ring-inset">
                      {z.recurrences}× recurred
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Problem clusters</CardTitle>
          <CardDescription>
            All detected hotspots (DBSCAN, 200 m radius, ≥3 issues) ranked by risk
          </CardDescription>
        </CardHeader>
        <div className="border-t">
          <HotspotList hotspots={hotspots} />
        </div>
      </Card>
    </main>
  );
}
