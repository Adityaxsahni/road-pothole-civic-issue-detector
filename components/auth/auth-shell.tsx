import { Logo } from "@/components/layout/logo";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="to-background flex flex-1 items-start justify-center bg-gradient-to-b from-blue-50/70 px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center sm:hidden">
          <Logo />
        </div>
        <div className="bg-card rounded-2xl border p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive mt-1.5 text-xs font-medium">
      {message}
    </p>
  );
}

/** Only allow same-origin relative redirects (prevents open-redirects via callbackUrl). */
export function safeCallback(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return null;
  return url;
}
