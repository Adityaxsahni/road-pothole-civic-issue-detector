import "server-only";
import { prisma } from "../db";

/**
 * Staff are scoped to their own municipality. Accounts without one (e.g. a platform admin) fall
 * back to the first configured municipality for dashboard views.
 */
export async function resolveMunicipalityId(user: { municipalityId: string | null }): Promise<string | null> {
  if (user.municipalityId) return user.municipalityId;
  const first = await prisma.municipality.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id ?? null;
}
