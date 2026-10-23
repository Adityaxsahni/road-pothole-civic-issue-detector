import { NextResponse } from "next/server";
import { assertUser } from "@/server/auth";
import { enforceRateLimit, handleRouteError, jsonError, toUploadedFile } from "@/server/http";
import { previewDetection } from "@/server/services/reports";

export const runtime = "nodejs";

/** AI preview for the reporting wizard: analyses one image without storing anything. */
export async function POST(req: Request) {
  try {
    const user = await assertUser();
    const limited = enforceRateLimit(req, "detect", 60, 60 * 60_000, user.id);
    if (limited) return limited;
    const form = await req.formData();
    const file = await toUploadedFile(form.get("file"));
    if (!file) return jsonError("Attach an image to analyse", 400);
    return NextResponse.json(await previewDetection(file));
  } catch (err) {
    return handleRouteError(err);
  }
}
