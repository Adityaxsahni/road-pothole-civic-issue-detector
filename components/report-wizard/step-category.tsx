"use client";

import { Check, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/reports/category-icon";
import { cn } from "@/lib/utils";
import type { DetectionSuggestion, WizardCategory } from "./types";

interface Props {
  categories: WizardCategory[];
  value: string | null;
  detection: DetectionSuggestion | null;
  onChange: (slug: string) => void;
}

export function StepCategory({ categories, value, detection, onChange }: Props) {
  const suggested = detection?.categoryName ? detection.label : null;
  const ordered = suggested
    ? [...categories].sort((a, b) => Number(b.slug === suggested) - Number(a.slug === suggested))
    : categories;
  const overriding = suggested && value && value !== suggested;

  return (
    <fieldset>
      <legend className="sr-only">Issue category</legend>
      {suggested && (
        <p className="text-muted-foreground mb-3 text-sm">
          Our AI pre-selected the most likely category. Confirm it, or choose another if it got it wrong.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
        {ordered.map((c) => {
          const selected = value === c.slug;
          const isSuggested = c.slug === suggested;
          return (
            <button
              key={c.slug}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(c.slug)}
              className={cn(
                "bg-card hover:border-primary/40 flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                selected && "border-primary ring-primary/25 ring-2",
              )}
            >
              <CategoryIcon icon={c.icon} color={c.color} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.name}
                  {isSuggested && (
                    <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                      <Sparkles className="size-3" aria-hidden /> AI {Math.round(detection!.confidence * 100)}
                      %
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground line-clamp-1 text-xs">{c.description}</span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected && "border-primary bg-primary text-white",
                )}
              >
                {selected && <Check className="size-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
      {overriding && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          You&apos;ve overridden the AI suggestion — thanks, this feedback helps improve the model.
        </p>
      )}
    </fieldset>
  );
}
