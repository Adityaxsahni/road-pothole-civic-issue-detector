import type { Metadata } from "next";
import { DashboardMobileNav, DashboardSidebar } from "@/components/dashboard/sidebar";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · CivicPulse Ops" } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ staff: true, callbackUrl: "/dashboard" });
  const municipality = user.municipalityId
    ? await prisma.municipality.findUnique({ where: { id: user.municipalityId }, select: { name: true } })
    : null;
  const name = municipality?.name ?? "All municipalities";

  return (
    <div className="bg-background min-h-dvh">
      <DashboardSidebar municipality={name} />
      <div className="lg:pl-64">
        <header className="bg-card/90 sticky top-0 z-[500] flex h-16 items-center gap-2 border-b px-4 backdrop-blur sm:px-6">
          <DashboardMobileNav municipality={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="text-muted-foreground truncate text-xs">
              Operations console · {user.role === "ADMIN" ? "Administrator" : "Staff"}
            </p>
          </div>
          <NotificationBell />
          <UserMenu user={user} />
        </header>
        <div id="main">{children}</div>
      </div>
    </div>
  );
}
