import { formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { DedupBadge, PriorityBadge, SeverityBadge, StatusBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import type { ReportListItem } from "@/server/services/queries";

/** Compact report row for feeds and queues. */
export function ReportRow({ report, showStatus = true }: { report: ReportListItem; showStatus?: boolean }) {
  return (
    <Link
      href={`/dashboard/reports/${report.id}`}
      className="hover:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors sm:px-5"
    >
      <CategoryIcon icon={report.category.icon} color={report.category.color} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{report.title}</p>
        </div>
        <p className="text-muted-foreground truncate text-xs">
          <span className="font-mono">{report.refCode}</span> · {report.category.name}
          {report.neighborhood ? ` · ${report.neighborhood.name}` : ""} ·{" "}
          {formatDistanceToNowStrict(report.createdAt, { addSuffix: true })}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
          <SeverityBadge severity={report.severity} />
          {showStatus && <StatusBadge status={report.status} />}
        </div>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        <DedupBadge
          status={report.dedupStatus === "DUPLICATE" ? "DUPLICATE" : report.dedupStatus}
          count={report.duplicateCount}
        />
        <SeverityBadge severity={report.severity} />
        {showStatus && <StatusBadge status={report.status} />}
      </div>
      <PriorityBadge score={report.priorityScore} />
    </Link>
  );
}
