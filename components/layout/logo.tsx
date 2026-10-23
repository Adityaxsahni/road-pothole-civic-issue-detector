import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="#1d4ed8" />
      <path d="M16 6.5a7 7 0 0 0-7 7c0 5.2 7 12 7 12s7-6.8 7-12a7 7 0 0 0-7-7Z" fill="#fff" />
      <circle cx="16" cy="13.5" r="3" fill="#1d4ed8" />
      <path
        d="M5 22.5h4l2-3 3 6 2.5-4.5H27"
        stroke="#7dd3fc"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg" aria-label={`${APP_NAME} home`}>
      <LogoMark />
      <span
        className={cn("text-lg font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}
      >
        {APP_NAME}
      </span>
    </Link>
  );
}
