import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportFilters } from "@/components/dashboard/report-filters";
import { ReportRow } from "@/components/dashboard/report-row";
import { DedupBadge, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OPEN_STATUSES } from "@/lib/constants";
import { reportFiltersSchema, searchParamsToRecord } from "@/lib/validation";
import { requireUser } from "@/server/auth";
import { getFilterOptions, listReports } from "@/server/services/queries";

export const metadata: Metadata = { title: "Issue queue" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser({ staff: true });
  const raw = searchParamsToRecord(await searchParams);
  // Work queue semantics: open issues unless the user explicitly asks for every status.
  const effective = { ...raw };
  if (!raw.status) effective.status = OPEN_STATUSES.join(",");
  else if (raw.status === "all") delete effective.status;
  const parsed = reportFiltersSchema.safeParse(effective);
  const filters = parsed.success ? parsed.data : reportFiltersSchema.parse({});
  const [result, options] = await Promise.all([
    listReports(user, filters),
    getFilterOptions(user.municipalityId),
  ]);

  const qs = new URLSearchParams(
    Object.entries(raw).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])),
  );
  const pageHref = (page: number) => {
    const p = new URLSearchParams(qs);
    p.set("page", String(page));
    return `/dashboard/reports?${p.toString()}`;
  };
  const exportParams = new URLSearchParams(qs);
  exportParams.delete("page");
  if (raw.status === "all") exportParams.delete("status");
  else if (!raw.status) exportParams.set("status", OPEN_STATUSES.join(","));
  const from = (result.page - 1) * result.pageSize + 1;
  const to = Math.min(result.total, result.page * result.pageSize);

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageHeader
        title="Issue queue"
        description="Filter, prioritise and triage every report in your municipality."
        actions={
          <Button asChild variant="outline">
            <a href={`/api/reports/export?${exportParams.toString()}`} download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <Card className="p-4">
        <Suspense>
          <ReportFilters options={options} />
        </Suspense>
      </Card>

      {!parsed.success && (
        <p className="text-destructive text-sm">Some filters were invalid and have been ignored.</p>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3 text-sm sm:px-5">
          <span className="text-muted-foreground" aria-live="polite">
            {result.total === 0
              ? "No reports match these filters"
              : `Showing ${from}–${to} of ${result.total}`}
          </span>
        </div>

        {/* Mobile: compact rows */}
        <div className="divide-y md:hidden">
          {result.items.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </div>

        {/* Desktop: full table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Priority</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Area / team</TableHead>
                <TableHead className="pr-5 text-right">Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((r) => (
                <TableRow key={r.id} className="group">
                  <TableCell className="pl-5">
                    <PriorityBadge score={r.priorityScore} />
                  </TableCell>
                  <TableCell className="max-w-[360px]">
                    <Link
                      href={`/dashboard/reports/${r.id}`}
                      className="flex items-center gap-3 rounded-md focus-visible:outline-2"
                    >
                      <CategoryIcon icon={r.category.icon} color={r.category.color} size="sm" />
                      <span className="min-w-0">
                        <span className="group-hover:text-primary block truncate font-medium">{r.title}</span>
                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                          <span className="font-mono">{r.refCode}</span> · {r.category.name}
                          <DedupBadge status={r.dedupStatus} count={r.duplicateCount} className="ml-1" />
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={r.severity} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground text-xs">
                    {r.confidence != null ? (
                      <span
                        className="inline-flex items-center gap-1"
                        title={r.aiAccepted === false ? "Citizen overrode the AI category" : "AI confidence"}
                      >
                        <Sparkles className="text-primary size-3" aria-hidden />
                        {Math.round(r.confidence * 100)}%{r.aiAccepted === false && " · overridden"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{r.neighborhood?.name ?? "—"}</div>
                    <div className="text-muted-foreground">{r.assignments[0]?.team.name ?? "Unassigned"}</div>
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground pr-5 text-right text-xs">
                    {format(r.createdAt, "d MMM yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {result.pageCount > 1 && (
          <nav
            className="flex items-center justify-between border-t px-4 py-3 sm:px-5"
            aria-label="Pagination"
          >
            <Button asChild={result.page > 1} variant="outline" size="sm" disabled={result.page <= 1}>
              {result.page > 1 ? (
                <Link href={pageHref(result.page - 1)}>
                  <ChevronLeft /> Previous
                </Link>
              ) : (
                <span>
                  <ChevronLeft /> Previous
                </span>
              )}
            </Button>
            <span className="text-muted-foreground text-sm">
              Page {result.page} of {result.pageCount}
            </span>
            <Button
              asChild={result.page < result.pageCount}
              variant="outline"
              size="sm"
              disabled={result.page >= result.pageCount}
            >
              {result.page < result.pageCount ? (
                <Link href={pageHref(result.page + 1)}>
                  Next <ChevronRight />
                </Link>
              ) : (
                <span>
                  Next <ChevronRight />
                </span>
              )}
            </Button>
          </nav>
        )}
      </Card>
    </main>
  );
}
