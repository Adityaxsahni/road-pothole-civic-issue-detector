"use client";

import { LayoutDashboard, ListChecks, LogOut, MapPinned } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface HeaderUser {
  name: string;
  email: string;
  role: "CITIZEN" | "STAFF" | "ADMIN";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu({ user }: { user: HeaderUser }) {
  const staff = user.role !== "CITIZEN";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full text-sm font-semibold">
            {initials(user.name)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="font-medium">{user.name}</div>
          <div className="text-muted-foreground truncate text-xs">{user.email}</div>
          <div className="text-primary mt-1 text-[11px] font-medium tracking-wide uppercase">
            {user.role.toLowerCase()}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {staff && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <LayoutDashboard /> City dashboard
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/my-reports">
            <ListChecks /> My reports
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/map">
            <MapPinned /> Issue map
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
