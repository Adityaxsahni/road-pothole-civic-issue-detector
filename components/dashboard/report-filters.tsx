"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { OPEN_STATUSES, SEVERITIES, SEVERITY_META, STATUS_META, STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Options {
  categories: Array<{ slug: string; name: string }>;
  neighborhoods: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
}

const OPEN_VALUE = OPEN_STATUSES.join(",");

/** URL-driven filters: every change is shareable/bookmarkable and server-rendered. */
export function ReportFilters({ options }: { options: Options }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Debounced free-text search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const severity = (params.get("severity") ?? "").split(",").filter(Boolean);
  const toggleSeverity = (s: string) => {
    const next = severity.includes(s) ? severity.filter((x) => x !== s) : [...severity, s];
    set({ severity: next.join(",") || null });
  };
  // The queue shows open work by default; "all" opts into closed reports too.
  const status = params.get("status") ?? "";
  const statusValue = !status || status === OPEN_VALUE ? "open" : status;
  const hasFilters = [
    "q",
    "status",
    "severity",
    "category",
    "neighborhood",
    "team",
    "dedup",
    "from",
    "to",
  ].some((k) => params.get(k));

  return (
    <div
      className={cn("flex flex-col gap-3 transition-opacity", pending && "opacity-70")}
      aria-busy={pending}
    >
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reference, title, description or address"
            className="pl-9"
            aria-label="Search reports"
          />
        </div>
        <NativeSelect
          aria-label="Sort by"
          value={params.get("sort") ?? "priority"}
          onChange={(e) => set({ sort: e.target.value === "priority" ? null : e.target.value })}
          className="md:w-48"
        >
          <option value="priority">Sort: Priority</option>
          <option value="severity">Sort: Severity</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        <NativeSelect
          aria-label="Status"
          value={statusValue}
          onChange={(e) => set({ status: e.target.value === "open" ? OPEN_VALUE : e.target.value })}
        >
          <option value="all">All statuses</option>
          <option value="open">Open issues</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Category"
          value={params.get("category") ?? ""}
          onChange={(e) => set({ category: e.target.value || null })}
        >
          <option value="">All categories</option>
          {options.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Neighbourhood"
          value={params.get("neighborhood") ?? ""}
          onChange={(e) => set({ neighborhood: e.target.value || null })}
        >
          <option value="">All neighbourhoods</option>
          {options.neighborhoods.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Assigned team"
          value={params.get("team") ?? ""}
          onChange={(e) => set({ team: e.target.value || null })}
        >
          <option value="">Any team</option>
          {options.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Duplicate status"
          value={params.get("dedup") ?? ""}
          onChange={(e) => set({ dedup: e.target.value || null })}
        >
          <option value="">Any dedup state</option>
          <option value="SUSPECTED">Possible duplicates</option>
          <option value="DUPLICATE">Merged duplicates</option>
          <option value="UNIQUE">Unique</option>
        </NativeSelect>
        <div className="col-span-2 flex items-center gap-2 md:col-span-3 xl:col-span-2">
          <Label htmlFor="from" className="sr-only">
            From date
          </Label>
          <Input
            id="from"
            type="date"
            value={params.get("from") ?? ""}
            onChange={(e) => set({ from: e.target.value || null })}
            className="min-w-0 px-2"
          />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <Label htmlFor="to" className="sr-only">
            To date
          </Label>
          <Input
            id="to"
            type="date"
            value={params.get("to") ?? ""}
            onChange={(e) => set({ to: e.target.value || null })}
            className="min-w-0 px-2"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">Severity</span>
        {SEVERITIES.map((s) => {
          const active = severity.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSeverity(s)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: SEVERITY_META[s].color }}
              />
              {SEVERITY_META[s].label}
            </button>
          );
        })}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X /> Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
