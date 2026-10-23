import { MapPinOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <MapPinOff className="text-muted-foreground size-12" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">We couldn&apos;t find that</h1>
      <p className="text-muted-foreground mt-2 max-w-sm">
        The page or report doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild>
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/map">Open the map</Link>
        </Button>
      </div>
    </main>
  );
}
