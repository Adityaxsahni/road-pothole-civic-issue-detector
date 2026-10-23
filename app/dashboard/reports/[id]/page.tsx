import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, ArrowLeft, Mail, MapPin, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityPanel } from "@/components/dashboard/activity-panel";
import { DuplicatePanel } from "@/components/dashboard/duplicate-panel";
import { PriorityBreakdown } from "@/components/dashboard/priority-breakdown";
import { ReportActions } from "@/components/dashboard/report-actions";
import { IssueMap } from "@/components/map/issue-map";
import { DedupBadge, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import { MediaGallery } from "@/components/reports/media-gallery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROAD_TYPE_META, TRAFFIC_META } from "@/lib/constants";
import type { PriorityFactor } from "@/lib/scoring";
import { formatPercent } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/services/errors";
import { getReportDetail } from "@/server/services/queries";

export const metadata: Metadata = { title: "Report" };

export default async function StaffReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser({ staff: true });
  const report = await getReportDetail(id, user).catch((err) => {
    if (err instanceof ServiceError) notFound();
    throw err;
  });
  const [teams, categories] = await Promise.all([
    prisma.team.findMany({
      where: { municipalityId: report.municipalityId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, specialties: true, members: { select: { id: true, name: true } } },
    }),
    prisma.issueCategory.findMany({ select: { slug: true, name: true } }),
  ]);
  const labelFor = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const activeAssignment = report.assignments.find((a) => a.active) ?? null;
  const slaDue = new Date(report.createdAt.getTime() + report.category.slaHours * 3_600_000);
  const open = !["RESOLVED", "REJECTED", "DUPLICATE"].includes(report.status);
  const overdue = open && slaDue < new Date();
  const primaryDetection = report.detections[0];
  const factors = (Array.isArray(report.priorityBreakdown)
    ? report.priorityBreakdown
    : []) as unknown as PriorityFactor[];

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <Link
        href="/dashboard/reports"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Issue queue
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <CategoryIcon icon={report.category.icon} color={report.category.color} size="lg" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">
              <span className="font-mono">{report.refCode}</span> · {report.category.name}
              {report.neighborhood && ` · ${report.neighborhood.name}`}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{report.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <PriorityBadge score={report.priorityScore} />
              <StatusBadge status={report.status} />
              <SeverityBadge severity={report.severity} />
              <DedupBadge status={report.dedupStatus} count={report.duplicateCount} />
              {overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-red-600/25 ring-inset">
                  <AlertTriangle className="size-3" aria-hidden /> SLA breached
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-muted-foreground text-sm lg:text-right">
          Reported {formatDistanceToNowStrict(report.createdAt, { addSuffix: true })}
          <br />
          <span className="text-xs">{format(report.createdAt, "EEE d MMM yyyy, HH:mm")}</span>
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Evidence</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MediaGallery media={report.media} detections={report.detections} labelFor={labelFor} />
              <div className="text-sm">
                <p className="whitespace-pre-line">{report.description}</p>
                {report.notes && (
                  <div className="bg-muted/60 mt-3 rounded-lg p-3">
                    <p className="text-muted-foreground text-xs font-medium">Citizen notes</p>
                    <p className="mt-0.5 whitespace-pre-line">{report.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="text-primary size-4" aria-hidden /> AI analysis
                </CardTitle>
                <CardDescription>
                  {primaryDetection
                    ? `${primaryDetection.modelName} v${primaryDetection.modelVersion}`
                    : "No image analysed"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                {primaryDetection ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-muted-foreground text-xs">Detected</dt>
                        <dd className="font-medium">
                          {primaryDetection.label === "other"
                            ? "Unclassified"
                            : labelFor(primaryDetection.label)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Confidence</dt>
                        <dd className="tabular font-medium">{formatPercent(primaryDetection.confidence)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Severity estimate</dt>
                        <dd className="tabular font-medium">
                          {Math.round(primaryDetection.severityScore)}/100
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Damage area</dt>
                        <dd className="tabular font-medium">
                          {primaryDetection.damageAreaRatio != null
                            ? formatPercent(primaryDetection.damageAreaRatio, 1) + " of frame"
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <p className="bg-muted/60 mt-4 rounded-lg p-3 text-xs">
                      {report.aiAccepted === true && "✓ Citizen confirmed the AI category."}
                      {report.aiAccepted === false &&
                        `Citizen overrode the AI (“${report.aiSuggestedCategory?.name}”) and chose “${report.category.name}”. Review the photo before verifying.`}
                      {report.aiAccepted == null &&
                        "The AI could not confidently classify this image; category set by the citizen."}
                    </p>
                    {report.detections.length > 1 && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        {report.detections.length} images analysed · best result shown
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Video-only report without a usable frame — verify manually.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Priority score</CardTitle>
                <CardDescription>Why this issue ranks where it does</CardDescription>
              </CardHeader>
              <CardContent>
                <PriorityBreakdown score={report.priorityScore} factors={factors} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Deduplication</CardTitle>
              <CardDescription>
                Matched by GPS proximity, time window, image similarity and category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DuplicatePanel
                reportId={report.id}
                dedupStatus={report.dedupStatus}
                duplicateScore={report.duplicateScore}
                duplicateOf={report.duplicateOf}
                duplicates={report.duplicates}
                groupReason={report.duplicateGroup?.reason ?? report.primaryOf?.reason ?? null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Full audit trail including staff-only notes</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityPanel
                reportId={report.id}
                entries={report.activity}
                currentStatus={report.status}
                actorName={user.name}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Triage</CardTitle>
              {activeAssignment && (
                <CardDescription>
                  Assigned to{" "}
                  <span className="text-foreground font-medium">{activeAssignment.team.name}</span>
                  {activeAssignment.assignee && ` · ${activeAssignment.assignee.name}`}
                  {activeAssignment.dueAt && ` · due ${format(activeAssignment.dueAt, "d MMM")}`}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <ReportActions
                reportId={report.id}
                status={report.status}
                categorySlug={report.category.slug}
                teams={teams}
                activeTeamId={activeAssignment?.team.id ?? null}
                slaDueAt={slaDue.toISOString()}
              />
            </CardContent>
          </Card>

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
              className="h-52"
              ariaLabel="Report location"
            />
            <CardContent className="pt-4 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {report.address ?? "No address provided"}
                  <span className="text-muted-foreground block text-xs">
                    {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                    {report.accuracyM ? ` · ±${Math.round(report.accuracyM)} m GPS` : ""}
                  </span>
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Road type</dt>
                  <dd>{ROAD_TYPE_META[report.roadType].label}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Traffic</dt>
                  <dd>{TRAFFIC_META[report.trafficLevel].label}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Severity score</dt>
                  <dd className="tabular">{Math.round(report.severityScore)}/100</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">SLA target</dt>
                  <dd className={overdue ? "font-medium text-red-700" : undefined}>
                    {report.category.slaHours} h · {format(slaDue, "d MMM HH:mm")}
                  </dd>
                </div>
                {report.resolvedAt && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Resolved</dt>
                    <dd>{format(report.resolvedAt, "d MMM yyyy, HH:mm")}</dd>
                  </div>
                )}
                <div className="col-span-2 border-t pt-3">
                  <dt className="text-muted-foreground text-xs">Reporter</dt>
                  <dd className="font-medium">{report.user.name}</dd>
                  <dd>
                    <a
                      href={`mailto:${report.user.email}?subject=${encodeURIComponent(`Your report ${report.refCode}`)}`}
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      <Mail className="size-3" aria-hidden /> {report.user.email}
                    </a>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {report.assignments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Assignment history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3 text-sm">
                  {report.assignments.map((a) => (
                    <li key={a.id} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: a.team.color }}
                      />
                      <div>
                        <p className="font-medium">
                          {a.team.name}
                          {a.active && (
                            <span className="ml-1.5 text-xs font-normal text-emerald-700">active</span>
                          )}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {format(a.createdAt, "d MMM")}
                          {a.assignee && ` · ${a.assignee.name}`}
                          {a.completedAt && ` · completed ${format(a.completedAt, "d MMM")}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
