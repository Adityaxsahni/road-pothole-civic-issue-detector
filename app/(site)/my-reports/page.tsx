import { formatDistanceToNow } from "date-fns";
import { ChevronRight, Inbox, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/site-footer";
import { DedupBadge, StatusBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import { Button } from "@/components/ui/button";
import { OPEN_STATUSES } from "@/lib/constants";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { reportListSelect } from "@/server/services/queries";

export const metadata: Metadata = { title: "My reports" };

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser({ callbackUrl: "/my-reports" });
  const { denied } = await searchParams;
  const reports = await prisma.report.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: reportListSelect,
  });
  const open = reports.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const resolved = reports.filter((r) => r.status === "RESOLVED").length;

  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {denied && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            The city dashboard is only available to municipal staff.
          </p>
        )}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My reports</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {reports.length} submitted · {open} open · {resolved} fixed
            </p>
          </div>
          <Button asChild>
            <Link href="/report">
              <Plus /> New report
            </Link>
          </Button>
        </div>

        {reports.length === 0 ? (
          <div className="bg-card mt-10 flex flex-col items-center rounded-2xl border border-dashed px-6 py-14 text-center">
            <Inbox className="text-muted-foreground size-10" aria-hidden />
            <p className="mt-4 font-medium">No reports yet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Spotted a pothole or a broken streetlight? It takes less than a minute to report.
            </p>
            <Button asChild className="mt-6">
              <Link href="/report">Report your first issue</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/my-reports/${r.id}`}
                  className="bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border p-3 transition-colors sm:p-4"
                >
                  {r.media[0]?.thumbnailUrl ? (
                    <img
                      src={r.media[0].thumbnailUrl}
                      alt=""
                      className="size-14 shrink-0 rounded-lg bg-slate-200 object-cover"
                    />
                  ) : (
                    <CategoryIcon icon={r.category.icon} color={r.category.color} size="lg" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="font-mono">{r.refCode}</span>·<span>{r.category.name}</span>
                    </div>
                    <p className="truncate font-medium">{r.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      <DedupBadge
                        status={r.dedupStatus === "SUSPECTED" ? "UNIQUE" : r.dedupStatus}
                        count={r.duplicateCount}
                      />
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
