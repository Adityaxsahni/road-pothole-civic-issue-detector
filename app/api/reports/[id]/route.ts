import { NextResponse } from "next/server";
import { assertUser } from "@/server/auth";
import { handleRouteError } from "@/server/http";
import { getReportDetail } from "@/server/services/queries";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await assertUser();
    const { id } = await params;
    const report = await getReportDetail(id, user);
    const { user: author, ...rest } = report;
    return NextResponse.json({
      ...rest,
      // Reporter contact details are only exposed to staff.
      user: user.role === "CITIZEN" ? { id: author.id, name: author.name } : author,
      relatedReportIds: report.duplicates.map((d) => d.id),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
