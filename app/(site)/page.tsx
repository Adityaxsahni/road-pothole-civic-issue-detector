import {
  ArrowRight,
  BellRing,
  Camera,
  CopyCheck,
  Gauge,
  LayoutDashboard,
  MapPinned,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/site-footer";
import { LiveMapPreview } from "@/components/map/live-map-preview";
import { Button } from "@/components/ui/button";
import { OPEN_STATUSES } from "@/lib/constants";
import { formatCompact, formatDuration } from "@/lib/utils";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

async function getPublicStats() {
  const municipality = await prisma.municipality.findFirst({ orderBy: { createdAt: "asc" } });
  if (!municipality) return null;
  const where = { municipalityId: municipality.id };
  const [total, resolved, open, hotspots, avg] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.count({ where: { ...where, status: "RESOLVED" } }),
    prisma.report.count({ where: { ...where, status: { in: OPEN_STATUSES } } }),
    prisma.hotspotCluster.count({ where }),
    prisma.$queryRaw<Array<{ hours: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600)::float AS hours
      FROM "Report" WHERE "municipalityId" = ${municipality.id} AND status = 'RESOLVED'`,
  ]);
  return { municipality, total, resolved, open, hotspots, avgHours: avg[0]?.hours ?? null };
}

const STEPS = [
  {
    icon: Camera,
    title: "Snap & pin",
    body: "Take a photo or short video. GPS pins the exact spot — no forms to wrestle with.",
  },
  {
    icon: ScanSearch,
    title: "AI checks it",
    body: "Computer vision identifies the issue, estimates damage and spots duplicates instantly.",
  },
  {
    icon: Wrench,
    title: "City fixes it",
    body: "Crews get a ranked queue. You get updates until it's resolved.",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI pothole detection",
    body: "YOLO-ready inference pipeline with a built-in vision fallback, confidence scores and bounding boxes.",
  },
  {
    icon: CopyCheck,
    title: "Duplicate merging",
    body: "GPS proximity, time window, perceptual image hashing and category matching fold repeat reports together.",
  },
  {
    icon: Gauge,
    title: "Explainable priority",
    body: "Every score breaks down into severity, traffic, road class, risk density, corroboration and SLA pressure.",
  },
  {
    icon: MapPinned,
    title: "Hotspot intelligence",
    body: "Density clustering ranks chronic problem corridors and recommends the right intervention.",
  },
  {
    icon: LayoutDashboard,
    title: "Operations dashboard",
    body: "Triage, assign crews, track SLAs, add notes and export filtered data for planning.",
  },
  {
    icon: BellRing,
    title: "Urgent alerts",
    body: "High-priority issues trigger in-app, email/SMS hooks and Slack-compatible webhooks.",
  },
];

export default async function HomePage() {
  const stats = await getPublicStats();
  const center: [number, number] = stats
    ? [stats.municipality.centerLat, stats.municipality.centerLng]
    : [12.9716, 77.6146];

  return (
    <>
      <main>
        <section className="via-background to-background relative overflow-hidden border-b bg-gradient-to-b from-blue-50/80">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-16">
            <div className="animate-fade-in">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-800">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                Live in {stats?.municipality.name ?? "your city"}
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Spot a pothole? <span className="text-primary">Get it fixed.</span>
              </h1>
              <p className="text-muted-foreground mt-4 max-w-xl text-lg text-pretty">
                Report road damage and civic issues in under a minute. AI identifies the problem and routes it
                to the right crew, ranked by real-world impact.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/report">
                    <Camera className="!size-5" /> Report an issue
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/map">
                    <MapPinned className="!size-5" /> Explore the map
                  </Link>
                </Button>
              </div>
              {stats && (
                <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: "Reports filed", value: formatCompact(stats.total) },
                    { label: "Issues fixed", value: formatCompact(stats.resolved) },
                    { label: "Open right now", value: formatCompact(stats.open) },
                    {
                      label: "Avg. time to fix",
                      value: stats.avgHours ? formatDuration(stats.avgHours) : "—",
                    },
                  ].map((s) => (
                    <div key={s.label}>
                      <dt className="text-muted-foreground text-xs">{s.label}</dt>
                      <dd className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <div className="bg-card relative h-[360px] overflow-hidden rounded-2xl border shadow-xl shadow-blue-900/5 sm:h-[460px]">
              <LiveMapPreview center={center} zoom={stats?.municipality.defaultZoom ?? 12} />
              <Link
                href="/map"
                className="bg-card/95 hover:bg-card absolute top-3 right-3 z-[400] inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium shadow"
              >
                Full map <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="how">
          <h2 id="how" className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-card rounded-2xl border p-6">
                <div className="flex items-center gap-3">
                  <span className="bg-primary flex size-10 items-center justify-center rounded-xl text-white">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-card border-y" aria-labelledby="features">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl">
              <h2 id="features" className="text-2xl font-semibold tracking-tight">
                Built for city operations
              </h2>
              <p className="text-muted-foreground mt-2">
                One platform from citizen report to crew dispatch, with the data infrastructure planners need.
              </p>
            </div>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <span className="bg-accent text-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="bg-sidebar flex flex-col items-start gap-6 rounded-3xl px-6 py-10 text-white sm:px-10 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-blue-200">
                <ShieldCheck className="size-4" aria-hidden /> For municipal staff
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Run maintenance from a ranked, deduplicated queue.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                {stats
                  ? `${stats.hotspots} active hotspots are being tracked right now.`
                  : "Hotspots, SLAs and crews in one place."}
              </p>
            </div>
            <Button asChild size="lg" variant="secondary">
              <Link href="/dashboard">
                Open dashboard <ArrowRight className="!size-5" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
