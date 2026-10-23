import { SiteHeader } from "@/components/layout/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div id="main" className="flex flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
