"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { addNoteSchema, assignSchema, duplicateDecisionSchema, updateStatusSchema } from "@/lib/validation";
import { AuthError, assertUser } from "../auth";
import { ServiceError } from "../services/errors";
import { recomputeReportPriority } from "../services/priority";
import { addNote, assignTeam, changeStatus, decideDuplicate } from "../services/reports";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<S extends z.ZodTypeAny, T>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>, user: Awaited<ReturnType<typeof assertUser>>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const user = await assertUser({ staff: true });
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const data = await fn(parsed.data, user);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServiceError || err instanceof AuthError) return { ok: false, error: err.message };
    console.error("[action] failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function revalidateReport(reportId: string) {
  revalidatePath(`/dashboard/reports/${reportId}`);
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard");
}

export async function updateStatusAction(input: z.input<typeof updateStatusSchema>) {
  return run(updateStatusSchema, input, async (d, user) => {
    await changeStatus({
      user,
      reportId: d.reportId,
      status: d.status as never,
      note: d.note,
      isPublic: d.isPublic,
    });
    revalidateReport(d.reportId);
  });
}

export async function addNoteAction(input: z.input<typeof addNoteSchema>) {
  return run(addNoteSchema, input, async (d, user) => {
    const log = await addNote({ user, reportId: d.reportId, note: d.note, isPublic: d.isPublic });
    revalidateReport(d.reportId);
    return { id: log.id, createdAt: log.createdAt.toISOString() };
  });
}

export async function assignTeamAction(input: z.input<typeof assignSchema>) {
  return run(assignSchema, input, async (d, user) => {
    await assignTeam({
      user,
      reportId: d.reportId,
      teamId: d.teamId,
      assigneeId: d.assigneeId,
      dueAt: d.dueAt,
      note: d.note,
    });
    revalidateReport(d.reportId);
  });
}

export async function duplicateDecisionAction(input: z.input<typeof duplicateDecisionSchema>) {
  return run(duplicateDecisionSchema, input, async (d, user) => {
    await decideDuplicate({ user, ...d });
    revalidateReport(d.reportId);
    if (d.decision === "confirm") revalidateReport(d.primaryId);
  });
}

export async function recomputePriorityAction(reportId: string) {
  return run(updateStatusSchema.pick({ reportId: true }), { reportId }, async (d) => {
    const res = await recomputeReportPriority(d.reportId);
    revalidateReport(d.reportId);
    return res?.result.score;
  });
}
