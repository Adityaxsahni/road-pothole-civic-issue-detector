import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** Styled native <select>: best accessibility and mobile UX for simple choices. */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "border-input bg-card focus-visible:outline-ring h-10 w-full appearance-none rounded-lg border pr-9 pl-3 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
    />
  </div>
));
NativeSelect.displayName = "NativeSelect";
