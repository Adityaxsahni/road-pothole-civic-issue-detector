import { CheckCircle2, CopyCheck, Eye, Plus, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriorityBadge, SeverityBadge } from "@/components/reports/badges";
import { CategoryIcon } from "@/components/reports/category-icon";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";
import { ServiceError } from "@/server/services/errors";
import { getReportDetail } from "@/server/services/queries";

export const metadata: Metadata = { title: "Report submitted" };

export default async function SubmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser({ callbackUrl: `/report/submitted/${id}` });
  const report = await getReportDetail(id, user).catch((err) => {
    if (err instanceof ServiceError) notFound();
    throw err;
  });
  const detection = report.detections[0];
  const merged = report.dedupStatus === "DUPLICATE" && report.duplicateOf;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center text-center">
        <span className="animate-pop flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="size-9" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Thank you — report received</h1>
        <p className="text-muted-foreground mt-2">
          Your reference number is{" "}
          <span
            className="bg-muted text-foreground rounded-md px-2 py-0.5 font-mono font-semibold"
            data-testid="ref-code"
          >
            {report.refCode}
          </span>
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {merged ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <CopyCheck className="size-5" aria-hidden /> Already on the city&apos;s radar
            </div>
            <p className="mt-1 text-sm text-blue-900/80">
              Someone reported this issue recently ({report.duplicateOf!.refCode}). We&apos;ve added your
              report to it — more reports raise its priority, and you&apos;ll get the same updates.
            </p>
          </div>
        ) : report.dedupStatus === "SUSPECTED" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            A similar report exists nearby. City staff will check whether they describe the same problem.
          </div>
        ) : null}

        <div className="bg-card rounded-2xl border p-4">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={report.category.icon} color={report.category.color} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{report.title}</p>
              <p className="text-muted-foreground text-sm">{report.category.name}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <SeverityBadge severity={report.severity} />
            <PriorityBadge score={report.priorityScore} />
          </div>
          {detection && (
            <p className="text-muted-foreground mt-3 flex items-start gap-2 text-sm">
              <Sparkles className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
              AI detected {report.aiSuggestedCategory?.name.toLowerCase() ??
                "an unclassified issue"} with {Math.round(detection.confidence * 100)}% confidence
              {report.aiAccepted === false ? " — your category choice was kept." : "."}
            </p>
          )}
        </div>

        <div className="bg-card rounded-2xl border p-4 text-sm">
          <p className="font-medium">What happens next</p>
          <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5">
            <li>City staff verify the report and confirm its priority.</li>
            <li>A maintenance crew is assigned based on the issue type.</li>
            <li>You&apos;ll get an update here when the status changes.</li>
          </ol>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="flex-1">
          <Link href={`/my-reports/${report.id}`}>
            <Eye className="!size-5" /> Track this report
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="flex-1">
          <Link href="/report">
            <Plus className="!size-5" /> Report another
          </Link>
        </Button>
      </div>
    </main>
  );
}
