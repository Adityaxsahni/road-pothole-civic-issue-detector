import { NextResponse } from "next/server";
import { z } from "zod";
import { assertUser } from "@/server/auth";
import { env } from "@/server/env";
import { enforceRateLimit, handleRouteError } from "@/server/http";

const query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * Server-side reverse geocoding proxy (keeps the provider and its user agent off the client).
 * Returns { address: null } when disabled so the wizard degrades to manual entry.
 */
export async function GET(req: Request) {
  try {
    await assertUser();
    const config = env();
    if (!config.ENABLE_REVERSE_GEOCODING) return NextResponse.json({ address: null, enabled: false });
    // Nominatim's policy allows at most 1 request per second per application.
    const limited = enforceRateLimit(req, "geocode", 30, 60_000);
    if (limited) return limited;

    const { lat, lng } = query.parse(Object.fromEntries(new URL(req.url).searchParams));
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": config.GEOCODER_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return NextResponse.json({ address: null, enabled: true });
    const data = (await res.json()) as { display_name?: string };
    const address = data.display_name?.split(",").slice(0, 4).join(",").trim() ?? null;
    return NextResponse.json({ address, enabled: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
