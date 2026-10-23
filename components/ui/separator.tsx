import { cn } from "@/lib/utils";

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      className={cn("bg-border shrink-0", vertical ? "h-full w-px" : "h-px w-full", className)}
    />
  );
}
