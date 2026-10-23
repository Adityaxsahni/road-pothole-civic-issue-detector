"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ActivityTimeline, type TimelineEntry } from "@/components/reports/activity-timeline";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNoteAction } from "@/server/actions/reports";

/** Timeline with an optimistic note composer: notes appear instantly, then reconcile on refresh. */
export function ActivityPanel({
  reportId,
  entries,
  currentStatus,
  actorName,
}: {
  reportId: string;
  entries: TimelineEntry[];
  currentStatus: TimelineEntry["status"];
  actorName: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic(entries, (state, entry: TimelineEntry) => [
    entry,
    ...state,
  ]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim();
    if (!text) return;
    // Clear outside the transition so the composer empties immediately.
    setNote("");
    startTransition(async () => {
      addOptimistic({
        id: `optimistic-${Date.now()}`,
        type: "NOTE",
        status: currentStatus,
        note: text,
        isPublic,
        createdAt: new Date(),
        actor: { name: actorName, role: "STAFF" },
      });
      const res = await addNoteAction({ reportId, note: text, isPublic });
      if (!res.ok) {
        toast.error(res.error);
        setNote(text);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="bg-muted/40 rounded-xl border p-3">
        <label htmlFor="note" className="sr-only">
          Add a note
        </label>
        <Textarea
          id="note"
          rows={2}
          value={note}
          maxLength={2000}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add an internal note or a public update…"
          className="bg-card min-h-16"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="accent-primary size-4 rounded"
            />
            Visible to citizen
          </label>
          <Button type="submit" size="sm" disabled={pending || !note.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Add note
          </Button>
        </div>
      </form>
      <ActivityTimeline entries={optimistic} showVisibility />
    </div>
  );
}
