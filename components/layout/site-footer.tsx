import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="bg-card border-t">
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="size-6" />
          <span>{APP_NAME} · Civic infrastructure reporting</span>
        </div>
        <nav className="flex gap-4" aria-label="Footer">
          <Link href="/map" className="hover:text-foreground">
            Map
          </Link>
          <Link href="/report" className="hover:text-foreground">
            Report
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Staff sign-in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
