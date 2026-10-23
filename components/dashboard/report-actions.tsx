"use client";

import type { ReportStatus } from "@prisma/client";
import { CheckCircle2, Loader2, RefreshCw, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_META, STATUS_TRANSITIONS } from "@/lib/constants";
import { assignTeamAction, recomputePriorityAction, updateStatusAction } from "@/server/actions/reports";

interface Team {
  id: string;
  name: string;
  specialties: string[];
  members: Array<{ id: string; name: string }>;
}

interface Props {
  reportId: string;
  status: ReportStatus;
  categorySlug: string;
  teams: Team[];
  activeTeamId: string | null;
  slaDueAt: string;
}

export function ReportActions({ reportId, status, categorySlug, teams, activeTeamId, slaDueAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const transitions = STATUS_TRANSITIONS[status];
  const [nextStatus, setNextStatus] = useState<ReportStatus | "">(
    transitions.find((s) => s !== "REJECTED") ?? "",
  );
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const closed = ["RESOLVED", "REJECTED", "DUPLICATE"].includes(status);

  function submitStatus(target: ReportStatus, message?: string) {
    startTransition(async () => {
      const res = await updateStatusAction({
        reportId,
        status: target,
        note: message ?? (note || undefined),
        isPublic,
      });
      if (res.ok) {
        toast.success(`Marked as ${STATUS_META[target].label.toLowerCase()}`);
        setNote("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function recompute() {
    startTransition(async () => {
      const res = await recomputePriorityAction(reportId);
      if (res.ok) {
        toast.success(`Priority recalculated: ${Math.round(res.data ?? 0)}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!closed && transitions.includes("RESOLVED") && (
        <Button
          variant="success"
          size="lg"
          disabled={pending}
          onClick={() => submitStatus("RESOLVED", note || "Issue fixed by field crew")}
        >
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="!size-5" />} Mark
          resolved
        </Button>
      )}

      {transitions.length > 0 && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (nextStatus) submitStatus(nextStatus);
          }}
        >
          <div>
            <Label htmlFor="next-status">Update status</Label>
            <NativeSelect
              id="next-status"
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ReportStatus)}
              className="mt-1.5"
            >
              {transitions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="status-note">Note (optional)</Label>
            <Textarea
              id="status-note"
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5 min-h-16"
              placeholder="Reason or update for the record"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="accent-primary size-4 rounded"
            />
            Notify the citizen (public update)
          </label>
          <Button type="submit" variant="outline" disabled={pending || !nextStatus}>
            {pending && <Loader2 className="animate-spin" />} Apply status
          </Button>
        </form>
      )}
      {status === "DUPLICATE" && (
        <p className="text-muted-foreground text-sm">
          This report is merged. Use “Unmerge” in the duplicates panel to reopen it.
        </p>
      )}

      {!closed && (
        <AssignDialog
          reportId={reportId}
          teams={teams}
          categorySlug={categorySlug}
          activeTeamId={activeTeamId}
          slaDueAt={slaDueAt}
        />
      )}

      <Button variant="ghost" size="sm" onClick={recompute} disabled={pending} className="self-start">
        <RefreshCw /> Recalculate priority
      </Button>
    </div>
  );
}

function AssignDialog({
  reportId,
  teams,
  categorySlug,
  activeTeamId,
  slaDueAt,
}: {
  reportId: string;
  teams: Team[];
  categorySlug: string;
  activeTeamId: string | null;
  slaDueAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const suggested = useMemo(
    () => teams.find((t) => t.specialties.includes(categorySlug))?.id ?? teams[0]?.id ?? "",
    [teams, categorySlug],
  );
  const [teamId, setTeamId] = useState(activeTeamId ?? suggested);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueAt, setDueAt] = useState(slaDueAt.slice(0, 10));
  const [note, setNote] = useState("");
  const team = teams.find((t) => t.id === teamId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await assignTeamAction({
        reportId,
        teamId,
        assigneeId: assigneeId || null,
        dueAt: dueAt ? new Date(`${dueAt}T18:00:00`) : null,
        note: note || undefined,
      });
      if (res.ok) {
        toast.success(`Assigned to ${team?.name}`);
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <UserPlus /> {activeTeamId ? "Reassign crew" : "Assign to team"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign maintenance crew</DialogTitle>
          <DialogDescription>
            The crew lead sees this in their queue; the citizen is notified.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="team">Team</Label>
            <NativeSelect
              id="team"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setAssigneeId("");
              }}
              className="mt-1.5"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.specialties.includes(categorySlug) ? " (recommended)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="assignee">Crew lead (optional)</Label>
            <NativeSelect
              id="assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="mt-1.5"
            >
              <option value="">Unassigned within team</option>
              {team?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="due">Due date</Label>
            <Input
              id="due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1.5"
            />
            <p className="text-muted-foreground mt-1 text-xs">Defaults to the category SLA.</p>
          </div>
          <div>
            <Label htmlFor="assign-note">Instructions (optional)</Label>
            <Textarea
              id="assign-note"
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1.5 min-h-16"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !teamId}>
              {pending && <Loader2 className="animate-spin" />} Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
