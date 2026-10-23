"use client";

import { BarChart3, Bell, LayoutDashboard, ListTodo, Map, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/reports", label: "Issue queue", icon: ListTodo },
  { href: "/dashboard/map", label: "Operations map", icon: Map },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/alerts", label: "Alerts", icon: Bell },
];

function NavList({ onNavigate, municipality }: { onNavigate?: () => void; municipality: string }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" inverted />
      </div>
      <div className="px-5 pb-3 text-xs font-medium tracking-wider text-slate-400 uppercase">
        {municipality}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Dashboard">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "text-sidebar-foreground hover:bg-sidebar-accent flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:text-white",
                active && "bg-sidebar-accent text-white",
              )}
            >
              <item.icon
                className={cn("size-[18px]", active ? "text-sky-300" : "text-slate-400")}
                aria-hidden
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4">
        <Link
          href="/report"
          className="hover:bg-sidebar-accent flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-medium text-white"
        >
          <Plus className="size-4" aria-hidden /> File a report
        </Link>
        <Link href="/map" className="mt-2 block text-center text-xs text-slate-400 hover:text-white">
          View public map
        </Link>
      </div>
    </div>
  );
}

export function DashboardSidebar({ municipality }: { municipality: string }) {
  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 z-[700] hidden w-64 lg:block">
      <NavList municipality={municipality} />
    </aside>
  );
}

export function DashboardMobileNav({ municipality }: { municipality: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" />
        </Button>
      </DialogTrigger>
      <DialogContent side="left" className="bg-sidebar [&>button]:text-white">
        <DialogTitle className="sr-only">Dashboard navigation</DialogTitle>
        <NavList municipality={municipality} onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
