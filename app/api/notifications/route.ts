import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUser, isStaff, type SessionUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { handleRouteError } from "@/server/http";

/** Staff see municipality-wide in-app alerts; citizens see updates addressed to them. */
function scope(user: SessionUser): Prisma.NotificationWhereInput {
  return isStaff(user)
    ? { channel: "IN_APP", userId: null, municipalityId: user.municipalityId ?? undefined }
    : { channel: "IN_APP", userId: user.id };
}

export async function GET() {
  try {
    const user = await assertUser();
    const where = scope(user);
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          title: true,
          body: true,
          severity: true,
          readAt: true,
          createdAt: true,
          reportId: true,
        },
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return NextResponse.json({ items, unread, staff: isStaff(user) });
  } catch (err) {
    return handleRouteError(err);
  }
}

const markSchema = z.object({ ids: z.array(z.string().cuid()).max(100).optional() });

/** Mark notifications read (all in scope when `ids` is omitted). */
export async function POST(req: Request) {
  try {
    const user = await assertUser();
    const { ids } = markSchema.parse(await req.json().catch(() => ({})));
    const result = await prisma.notification.updateMany({
      where: { ...scope(user), readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return handleRouteError(err);
  }
}
