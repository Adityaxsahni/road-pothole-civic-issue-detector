import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatCompact(n: number): string {
  return n < 1000 ? String(Math.round(n)) : compact.format(n);
}

export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

/** Strip control characters and collapse whitespace in user-provided text. */
export function sanitizeText(input: string, { multiline = false }: { multiline?: boolean } = {}): string {
  const withoutControl = input.replace(
    multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g,
    " ",
  );
  const normalized = multiline
    ? withoutControl.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
    : withoutControl.replace(/\s+/g, " ");
  return normalized.trim();
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s_-])(\w)/g, (_, p, c: string) => `${p === "_" ? " " : p}${c.toUpperCase()}`);
}
