import type { DedupStatus, ReportStatus, Severity } from "@prisma/client";
import { CopyCheck, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEDUP_META, priorityBand, SEVERITY_META, STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge variant="plain" className={cn(meta.badge, className)}>
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="plain" className={cn(meta.badge, className)} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({
  score,
  className,
  showScore = true,
}: {
  score: number;
  className?: string;
  showScore?: boolean;
}) {
  const band = priorityBand(score);
  return (
    <Badge
      variant="plain"
      className={cn("tabular font-semibold", band.badge, className)}
      title={`${band.label} · score ${score.toFixed(1)}`}
    >
      {band.short}
      {showScore && <span className="font-normal opacity-85">{Math.round(score)}</span>}
    </Badge>
  );
}

export function DedupBadge({
  status,
  count,
  className,
}: {
  status: DedupStatus;
  count?: number;
  className?: string;
}) {
  if (status === "UNIQUE" && !count) return null;
  if (status === "UNIQUE" && count) {
    return (
      <Badge
        variant="plain"
        className={cn("bg-blue-50 text-blue-800 ring-blue-600/20", className)}
        title="Citizen reports merged into this one"
      >
        <CopyCheck className="size-3" aria-hidden />+{count} report{count === 1 ? "" : "s"}
      </Badge>
    );
  }
  const meta = DEDUP_META[status];
  return (
    <Badge variant="plain" className={cn(meta.badge, className)}>
      <Copy className="size-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}
