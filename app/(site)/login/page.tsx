import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell, safeCallback } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser, isStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getCurrentUser();
  if (user)
    redirect(
      safeCallback((await searchParams).callbackUrl) ?? (isStaff(user) ? "/dashboard" : "/my-reports"),
    );
  // Demo credentials are surfaced outside production builds, or when explicitly enabled.
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true";
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to report issues or open the city dashboard.">
      <Suspense>
        <LoginForm showDemo={showDemo} />
      </Suspense>
    </AuthShell>
  );
}
