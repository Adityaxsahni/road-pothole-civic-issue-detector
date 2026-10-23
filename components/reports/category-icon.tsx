import {
  CircleHelp,
  Construction,
  Droplets,
  Lightbulb,
  OctagonAlert,
  Signpost,
  Split,
  Trash2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  construction: Construction,
  split: Split,
  waves: Waves,
  droplets: Droplets,
  trash: Trash2,
  signpost: Signpost,
  lightbulb: Lightbulb,
  alert: OctagonAlert,
  help: CircleHelp,
};

const BY_SLUG: Record<string, string> = {
  pothole: "construction",
  "road-crack": "split",
  "blocked-drain": "waves",
  "water-leak": "droplets",
  trash: "trash",
  "fallen-sign": "signpost",
  "broken-streetlight": "lightbulb",
  "open-manhole": "alert",
  other: "help",
};

export function categoryIcon(iconOrSlug: string): LucideIcon {
  return ICONS[iconOrSlug] ?? ICONS[BY_SLUG[iconOrSlug] ?? "help"] ?? CircleHelp;
}

/** Bare category glyph (icon chosen from a static map). */
export function CategoryGlyph({ icon, className }: { icon: string; className?: string }) {
  return createElement(categoryIcon(icon), { className, "aria-hidden": true });
}

/** Category glyph on a tinted chip; the colour is identity only, the name is always shown nearby. */
export function CategoryIcon({
  icon,
  color,
  className,
  size = "md",
}: {
  icon: string;
  color?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-12" : "size-9";
  const glyph = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-[18px]";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", box, className)}
      style={{ backgroundColor: `${color ?? "#64748b"}1f`, color: color ?? "#64748b" }}
    >
      <CategoryGlyph icon={icon} className={glyph} />
    </span>
  );
}
