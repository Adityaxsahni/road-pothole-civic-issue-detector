import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isStaff } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const links = [
    { href: "/map", label: "Issue map" },
    { href: "/report", label: "Report an issue" },
    ...(user ? [{ href: "/my-reports", label: "My reports" }] : []),
    ...(isStaff(user) ? [{ href: "/dashboard", label: "Dashboard" }] : []),
  ];
  return (
    <header className="bg-card/90 supports-[backdrop-filter]:bg-card/75 sticky top-0 z-[500] border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <MobileNav links={links} />
        <Logo />
        <NavLinks links={links.filter((l) => l.href !== "/report")} />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button asChild size="sm" className="hidden h-9 sm:inline-flex">
            <Link href="/report">
              <Plus /> Report issue
            </Link>
          </Button>
          {user ? (
            <>
              <NotificationBell />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-9">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="hidden h-9 sm:inline-flex">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
