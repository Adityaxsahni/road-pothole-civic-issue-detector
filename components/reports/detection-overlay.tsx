import { cn } from "@/lib/utils";

export interface NormalizedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Image with the AI's normalised bounding box drawn on top (percent-positioned, so it scales). */
export function DetectionOverlay({
  src,
  alt,
  box,
  label,
  className,
  imgClassName,
}: {
  src: string;
  alt: string;
  box?: NormalizedBox | null;
  label?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-slate-900", className)}>
      <img src={src} alt={alt} className={cn("block h-auto w-full", imgClassName)} />
      {box && (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-amber-400 shadow-[0_0_0_9999px_rgb(2_6_23/0.25)]"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        >
          {label && (
            <span className="absolute -top-6 left-0 rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-slate-950">
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
