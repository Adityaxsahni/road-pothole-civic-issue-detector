import type { Prisma } from "@prisma/client";
import { isStaff } from "@/lib/roles";
import { assertSafeKey } from "@/server/storage/types";
import { getCurrentUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { jsonError } from "@/server/http";
import { storage } from "@/server/storage";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/**
 * Authenticated media delivery. Only the reporting citizen and staff of the report's municipality
 * can fetch originals or thumbnails; files are never served from a public bucket.
 */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentication required", 401);

  const key = (await params).key.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return jsonError("Not found", 404);
  }
  const originalKey = key.endsWith("_thumb.webp") ? key.replace(/_thumb\.webp$/, ".jpg") : key;

  const access: Prisma.ReportWhereInput = isStaff(user)
    ? user.municipalityId
      ? { municipalityId: user.municipalityId }
      : {}
    : { userId: user.id };
  const asset = await prisma.mediaAsset.findFirst({
    where: { storageKey: originalKey, report: access },
    select: { id: true },
  });
  if (!asset) return jsonError("Not found", 404);

  const object = await storage().get(key);
  if (!object) return jsonError("Not found", 404);

  const ext = key.split(".").pop()!.toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
  };

  // Byte-range support so mobile browsers can stream and seek uploaded videos.
  const range = req.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] || match[2])) {
    const size = object.size;
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(object.data.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(new Uint8Array(object.data), {
    headers: { ...headers, "Content-Length": String(object.size) },
  });
}
