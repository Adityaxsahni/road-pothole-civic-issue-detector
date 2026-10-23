import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/report");
  if (!env().ALLOW_PUBLIC_REGISTRATION) redirect("/login");
  return (
    <AuthShell title="Create your account" subtitle="Track your reports and get notified when they're fixed.">
      <RegisterForm />
    </AuthShell>
  );
}
