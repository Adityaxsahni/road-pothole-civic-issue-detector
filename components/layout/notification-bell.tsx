"use client";

import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SEVERITY_META } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  title: string;
  body: string;
  severity: keyof typeof SEVERITY_META | null;
  readAt: string | null;
  createdAt: string;
  reportId: string | null;
}

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [staff, setStaff] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Poll every minute; failures (offline, transient) keep the last known state.
  useEffect(() => {
    let cancelled = false;
    const poll = () =>
      fetch("/api/notifications", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setItems(data.items);
          setUnread(data.unread);
          setStaff(data.staff);
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);

  async function markAllRead() {
    setUnread(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => setRefreshKey((k) => k + 1));
  }

  const href = (i: Item) =>
    i.reportId ? (staff ? `/dashboard/reports/${i.reportId}` : `/my-reports/${i.reportId}`) : "#";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">{staff ? "Urgent alerts" : "Updates"}</span>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-primary hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="max-h-96 overflow-y-auto p-1">
          {items.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">You&apos;re all caught up.</p>
          )}
          {items.map((i) => (
            <DropdownMenuItem key={i.id} asChild className="items-start">
              <Link href={href(i)}>
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", !i.readAt ? "" : "opacity-0")}
                  style={{ backgroundColor: i.severity ? SEVERITY_META[i.severity].color : "#2563eb" }}
                />
                <span className="min-w-0">
                  <span className={cn("block text-sm", !i.readAt && "font-semibold")}>{i.title}</span>
                  <span className="text-muted-foreground line-clamp-2 block text-xs">{i.body}</span>
                  <span className="text-muted-foreground mt-0.5 block text-[11px]">
                    {formatDistanceToNow(new Date(i.createdAt), { addSuffix: true })}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        {staff && (
          <>
            <DropdownMenuSeparator className="mx-0 my-0" />
            <Link
              href="/dashboard/alerts"
              className="text-primary hover:bg-muted block px-3 py-2.5 text-center text-sm font-medium"
            >
              View all alerts
            </Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
