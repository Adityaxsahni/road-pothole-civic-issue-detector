import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { AuthError } from "./auth";
import { ServiceError } from "./services/errors";
import type { UploadedFile } from "./services/reports";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Map domain/validation/auth errors to HTTP responses without leaking internals. */
export function handleRouteError(err: unknown) {
  if (err instanceof AuthError) return jsonError(err.message, err.status);
  if (err instanceof ServiceError)
    return jsonError(err.message, err.status, err.fieldErrors ? { fieldErrors: err.fieldErrors } : undefined);
  if (err instanceof ZodError)
    return jsonError("Invalid request", 400, { fieldErrors: err.flatten().fieldErrors });
  console.error("[api] unhandled error", err);
  return jsonError("Something went wrong. Please try again.", 500);
}

export function enforceRateLimit(
  req: Request,
  namespace: string,
  limit: number,
  windowMs: number,
  key?: string,
) {
  const result = rateLimit(namespace, key ?? clientIp(req.headers), limit, windowMs);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
    );
  }
  return null;
}

export async function toUploadedFile(value: FormDataEntryValue | null): Promise<UploadedFile | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  return {
    name: value.name.slice(0, 120) || "upload",
    size: value.size,
    data: Buffer.from(await value.arrayBuffer()),
  };
}
