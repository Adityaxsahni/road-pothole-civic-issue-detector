import {
  AlertOctagon,
  ArrowRight,
  CheckCircle2,
  Clock,
  CopyCheck,
  Download,
  Inbox,
  TimerOff,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/charts/bar-list";
import { SeverityChart } from "@/components/charts/severity-chart";
import { HotspotList } from "@/components/dashboard/hotspot-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportRow } from "@/components/dashboard/report-row";
import { StatTile } from "@/components/dashboard/stat-tile";
import { CategoryIcon } from "@/components/reports/category-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORICAL, OPEN_STATUSES, STATUS_META } from "@/lib/constants";
import { formatCompact, formatDuration, formatPercent } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  getCategoryBreakdown,
  getHotspots,
  getOverviewStats,
  getPriorityQueue,
  getRecentReports,
  getSeverityDistribution,
  getStatusBreakdown,
} from "@/server/services/analytics";
import { resolveMunicipalityId } from "@/server/services/municipality";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser({ staff: true });
  const municipalityId = await resolveMunicipalityId(user);
  if (!municipalityId) return <p className="p-6">No municipality configured. Run the seed script.</p>;

  const [stats, queue, recent, categories, severity, hotspots, allCategories, pipeline] = await Promise.all([
    getOverviewStats(municipalityId),
    getPriorityQueue(municipalityId, 8),
    getRecentReports(municipalityId, 6),
    getCategoryBreakdown(municipalityId),
    getSeverityDistribution(municipalityId),
    getHotspots(municipalityId, 5),
    prisma.issueCategory.findMany({ select: { slug: true, icon: true, color: true } }),
    getStatusBreakdown(municipalityId),
  ]);
  const iconFor = (slug: string) => allCategories.find((c) => c.slug === slug);
  const firstName = user.name.split(" ")[0];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title={`Good to see you, ${firstName}`}
        description="Live view of reported issues, priorities and hotspots."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/reports/export?status=${OPEN_STATUSES.join(",")}`}>
                <Download /> Export open issues
              </a>
            </Button>
            <Button asChild>
              <Link href="/dashboard/reports">
                Open issue queue <ArrowRight />
              </Link>
            </Button>
          </>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatTile
          label="Total reports"
          value={formatCompact(stats.total)}
          icon={Inbox}
          delta={{ value: stats.last7 - stats.prev7, label: "vs previous 7 days", upIsGood: false }}
        />
        <StatTile
          label="Unresolved"
          value={formatCompact(stats.open)}
          icon={Clock}
          hint={`${formatCompact(stats.resolved)} resolved to date`}
        />
        <StatTile
          label="Resolution rate"
          value={formatPercent(stats.resolutionRate)}
          icon={CheckCircle2}
          hint="Resolved ÷ (resolved + open)"
        />
        <StatTile
          label="Critical open"
          value={String(stats.criticalOpen)}
          icon={AlertOctagon}
          tone={stats.criticalOpen ? "critical" : "default"}
          hint="Needs same-day response"
        />
        <StatTile
          label="Avg. time to resolve"
          value={stats.avgResolutionHours ? formatDuration(stats.avgResolutionHours) : "—"}
          icon={TimerOff}
          hint={`${stats.slaBreaches} open past SLA`}
          tone={stats.slaBreaches ? "warning" : "default"}
        />
        <StatTile
          label="Duplicates merged"
          value={String(stats.merged)}
          icon={CopyCheck}
          hint={`${stats.suspected} awaiting review`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Priority queue</CardTitle>
              <CardDescription>Open issues ranked by explainable priority score</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/reports?sort=priority&status=NEW,VERIFIED,ASSIGNED,IN_PROGRESS">
                View all
              </Link>
            </Button>
          </CardHeader>
          <div className="divide-y border-t">
            {queue.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
            {queue.length === 0 && (
              <p className="text-muted-foreground px-5 py-10 text-center text-sm">Queue is clear 🎉</p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Hotspot regions</CardTitle>
              <CardDescription>Chronic problem clusters by risk</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/map">Map</Link>
            </Button>
          </CardHeader>
          <div className="border-t">
            <HotspotList hotspots={hotspots} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Issues by category</CardTitle>
            <CardDescription>Open (solid) out of all unique reports</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              color={CATEGORICAL[0]}
              secondaryLabel="open"
              items={categories.map((c) => {
                const meta = iconFor(c.slug);
                return {
                  key: c.slug,
                  label: c.name,
                  value: c.total,
                  secondary: c.open,
                  href: `/dashboard/reports?category=${c.slug}`,
                  icon: meta ? <CategoryIcon icon={meta.icon} color={meta.color} size="sm" /> : undefined,
                };
              })}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open issues by severity</CardTitle>
            <CardDescription>
              {stats.open} unresolved · {stats.unique} unique issues overall
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SeverityChart data={severity} />
            <div className="mt-6 border-t pt-5">
              <p className="mb-3 text-sm font-medium">Maintenance pipeline</p>
              <BarList
                color={CATEGORICAL[0]}
                items={pipeline.map((p) => ({
                  key: p.status,
                  label: STATUS_META[p.status].label,
                  value: p.count,
                  href: `/dashboard/reports?status=${p.status}`,
                }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Recent reports</CardTitle>
            <CardDescription>Latest citizen submissions</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/reports?sort=newest">View all</Link>
          </Button>
        </CardHeader>
        <div className="divide-y border-t">
          {recent.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>
      </Card>
    </main>
  );
}
