import { format } from "date-fns";
import { ArrowLeft, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IssueMap } from "@/components/map/issue-map";
import { ActivityTimeline } from "@/components/reports/activity-timeline";
import { DedupBadge, SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import { MediaGallery } from "@/components/reports/media-gallery";
import { StatusTracker } from "@/components/reports/status-tracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/services/errors";
import { getReportDetail } from "@/server/services/queries";

export const metadata: Metadata = { title: "Report details" };

export default async function CitizenReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser({ callbackUrl: `/my-reports/${id}` });
  const report = await getReportDetail(id, user).catch((err) => {
    if (err instanceof ServiceError) notFound();
    throw err;
  });
  const categories = await prisma.issueCategory.findMany({ select: { slug: true, name: true } });
  const labelFor = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const team = report.assignments.find((a) => a.active)?.team;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
      <Link
        href="/my-reports"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> My reports
      </Link>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <CategoryIcon icon={report.category.icon} color={report.category.color} size="lg" />
          <div>
            <p className="text-muted-foreground text-sm">
              <span className="font-mono">{report.refCode}</span> · {report.category.name}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge status={report.status} />
              <SeverityBadge severity={report.severity} />
              <DedupBadge
                status={report.dedupStatus === "SUSPECTED" ? "UNIQUE" : report.dedupStatus}
                count={report.duplicateCount}
              />
            </div>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardContent className="pt-5">
          <StatusTracker status={report.status} />
          {team && report.status !== "RESOLVED" && (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              Assigned to <span className="text-foreground font-medium">{team.name}</span>
            </p>
          )}
          {report.duplicateOf && report.dedupStatus === "DUPLICATE" && (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              Merged into{" "}
              <span className="text-foreground font-mono font-medium">{report.duplicateOf.refCode}</span> (
              {report.duplicateOf.status.toLowerCase().replace("_", " ")})
            </p>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Photos &amp; video</CardTitle>
            </CardHeader>
            <CardContent>
              <MediaGallery media={report.media} detections={report.detections} labelFor={labelFor} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-line">{report.description}</p>
              {report.notes && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Notes</p>
                  <p className="whitespace-pre-line">{report.notes}</p>
                </div>
              )}
              <p className="text-muted-foreground text-xs">
                Submitted {format(report.createdAt, "d MMM yyyy 'at' HH:mm")}
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card className="overflow-hidden">
            <IssueMap
              points={[
                {
                  id: report.id,
                  refCode: report.refCode,
                  title: report.title,
                  lat: report.latitude,
                  lng: report.longitude,
                  status: report.status,
                  severity: report.severity,
                  priority: report.priorityScore,
                  categoryName: report.category.name,
                  duplicateCount: report.duplicateCount,
                },
              ]}
              center={[report.latitude, report.longitude]}
              zoom={16}
              showHotspots={false}
              className="h-56"
              ariaLabel="Report location"
            />
            <div className="flex items-start gap-2 p-4 text-sm">
              <MapPin className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{report.address ?? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}</span>
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={report.activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
