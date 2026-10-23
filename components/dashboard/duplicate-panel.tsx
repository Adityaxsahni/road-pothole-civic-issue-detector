"use client";

import type { DedupStatus, ReportStatus } from "@prisma/client";
import { format } from "date-fns";
import { Check, Loader2, Merge, Split, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { DedupBadge, StatusBadge } from "@/components/reports/badges";
import { Button } from "@/components/ui/button";
import { duplicateDecisionAction } from "@/server/actions/reports";

interface Linked {
  id: string;
  refCode: string;
  title: string;
  status: ReportStatus;
  createdAt: Date;
  dedupStatus?: DedupStatus;
  duplicateScore?: number | null;
}

export function DuplicatePanel({
  reportId,
  dedupStatus,
  duplicateScore,
  duplicateOf,
  duplicates,
  groupReason,
}: {
  reportId: string;
  dedupStatus: DedupStatus;
  duplicateScore: number | null;
  duplicateOf: Linked | null;
  duplicates: Linked[];
  groupReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(input: Parameters<typeof duplicateDecisionAction>[0], success: string) {
    startTransition(async () => {
      const res = await duplicateDecisionAction(input);
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const merged = duplicates.filter((d) => d.dedupStatus === "DUPLICATE");
  const suspected = duplicates.filter((d) => d.dedupStatus === "SUSPECTED");

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <DedupBadge status={dedupStatus} count={dedupStatus === "UNIQUE" ? merged.length : undefined} />
        {dedupStatus === "UNIQUE" && merged.length === 0 && (
          <span className="text-muted-foreground">No duplicates detected.</span>
        )}
        {duplicateScore != null && dedupStatus !== "UNIQUE" && (
          <span className="tabular text-muted-foreground">
            {Math.round(duplicateScore * 100)}% match score
          </span>
        )}
      </div>

      {duplicateOf && (
        <div className="bg-muted/40 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {dedupStatus === "DUPLICATE" ? "Merged into" : "Possible duplicate of"}
          </p>
          <Link
            href={`/dashboard/reports/${duplicateOf.id}`}
            className="hover:text-primary mt-1 flex items-center justify-between gap-2"
          >
            <span className="min-w-0 truncate font-medium">
              <span className="font-mono">{duplicateOf.refCode}</span> · {duplicateOf.title}
            </span>
            <StatusBadge status={duplicateOf.status} />
          </Link>
          {groupReason && <p className="text-muted-foreground mt-1 text-xs">{groupReason}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {dedupStatus === "SUSPECTED" && (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    decide(
                      { decision: "confirm", reportId, primaryId: duplicateOf.id },
                      "Merged as duplicate",
                    )
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Merge />} Confirm &amp; merge
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => decide({ decision: "dismiss", reportId }, "Marked as a separate issue")}
                >
                  <X /> Not a duplicate
                </Button>
              </>
            )}
            {dedupStatus === "DUPLICATE" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => decide({ decision: "unlink", reportId }, "Report unmerged and reopened")}
              >
                <Split /> Unmerge
              </Button>
            )}
          </div>
        </div>
      )}

      {merged.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Merged citizen reports ({merged.length}) — boost priority via corroboration
          </p>
          <ul className="divide-y rounded-lg border">
            {merged.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dashboard/reports/${d.id}`}
                  className="hover:bg-muted/60 flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs">{d.refCode}</span> · {format(d.createdAt, "d MMM")}
                  </span>
                  <span className="tabular text-muted-foreground text-xs">
                    {d.duplicateScore != null ? `${Math.round(d.duplicateScore * 100)}%` : "manual"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suspected.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Flagged as possibly the same issue ({suspected.length})
          </p>
          <ul className="divide-y rounded-lg border">
            {suspected.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <Link href={`/dashboard/reports/${d.id}`} className="hover:text-primary min-w-0 truncate">
                  <span className="font-mono text-xs">{d.refCode}</span> · {d.title}
                </Link>
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Merge ${d.refCode} into this report`}
                    disabled={pending}
                    onClick={() =>
                      decide(
                        { decision: "confirm", reportId: d.id, primaryId: reportId },
                        `${d.refCode} merged`,
                      )
                    }
                  >
                    <Check />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Dismiss ${d.refCode}`}
                    disabled={pending}
                    onClick={() =>
                      decide({ decision: "dismiss", reportId: d.id }, `${d.refCode} kept separate`)
                    }
                  >
                    <X />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
