import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { enforceRateLimit, handleRouteError, jsonError } from "@/server/http";

export async function POST(req: Request) {
  try {
    if (!env().ALLOW_PUBLIC_REGISTRATION) return jsonError("Registration is disabled", 403);
    const limited = enforceRateLimit(req, "register", 5, 60 * 60_000);
    if (limited) return limited;

    const parsed = registerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return jsonError("Please fix the highlighted fields", 400, {
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing)
      return jsonError("An account with this email already exists", 409, {
        fieldErrors: { email: ["Already registered"] },
      });

    const municipality = await prisma.municipality.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    // Self-registration always creates citizen accounts; staff are provisioned by administrators.
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "CITIZEN",
        municipalityId: municipality?.id,
      },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
