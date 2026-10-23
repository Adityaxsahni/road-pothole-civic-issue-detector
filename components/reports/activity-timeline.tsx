import type { ActivityType, ReportStatus } from "@prisma/client";
import { format } from "date-fns";
import {
  Bell,
  CircleDot,
  Copy,
  Flag,
  Lock,
  MessageSquare,
  Sparkles,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  type: ActivityType;
  status: ReportStatus;
  note: string | null;
  isPublic: boolean;
  createdAt: Date;
  actor: { name: string; role: string } | null;
}

const ICON: Record<ActivityType, LucideIcon> = {
  CREATED: Flag,
  STATUS_CHANGE: CircleDot,
  NOTE: MessageSquare,
  ASSIGNMENT: UserCheck,
  DUPLICATE: Copy,
  AI_ANALYSIS: Sparkles,
  PRIORITY: CircleDot,
  NOTIFICATION: Bell,
};

const TONE: Partial<Record<ActivityType, string>> = {
  CREATED: "bg-primary text-white",
  AI_ANALYSIS: "bg-violet-100 text-violet-700",
  DUPLICATE: "bg-fuchsia-100 text-fuchsia-700",
  ASSIGNMENT: "bg-indigo-100 text-indigo-700",
  NOTE: "bg-slate-100 text-slate-700",
  NOTIFICATION: "bg-red-100 text-red-700",
};

function headline(e: TimelineEntry): string {
  switch (e.type) {
    case "CREATED":
      return "Report submitted";
    case "STATUS_CHANGE":
      return `Status changed to ${STATUS_META[e.status].label}`;
    case "NOTE":
      return e.isPublic ? "Update from the city" : "Internal note";
    case "ASSIGNMENT":
      return "Crew assigned";
    case "DUPLICATE":
      return "Duplicate check";
    case "AI_ANALYSIS":
      return "AI analysis";
    case "NOTIFICATION":
      return "Alert raised";
    default:
      return "Activity";
  }
}

export function ActivityTimeline({
  entries,
  showVisibility = false,
}: {
  entries: TimelineEntry[];
  showVisibility?: boolean;
}) {
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">No activity yet.</p>;
  return (
    <ol className="relative flex flex-col gap-5">
      {entries.map((e, i) => {
        const Icon = ICON[e.type];
        const resolved = e.type === "STATUS_CHANGE" && e.status === "RESOLVED";
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < entries.length - 1 && (
              <span aria-hidden className="bg-border absolute top-8 left-[15px] h-[calc(100%-4px)] w-px" />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
                resolved ? "bg-emerald-600 text-white" : (TONE[e.type] ?? "bg-sky-100 text-sky-700"),
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{headline(e)}</span>
                {showVisibility && !e.isPublic && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    <Lock className="size-2.5" aria-hidden /> Staff only
                  </span>
                )}
              </div>
              {e.note && <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-line">{e.note}</p>}
              <p className="text-muted-foreground mt-1 text-xs">
                <time dateTime={e.createdAt.toISOString()}>{format(e.createdAt, "d MMM yyyy, HH:mm")}</time>
                {e.actor && ` · ${e.actor.name}${e.actor.role !== "CITIZEN" ? " (city staff)" : ""}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
