"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, safeCallback } from "./auth-shell";

const DEMO = [
  { label: "City admin", email: "admin@civicpulse.dev" },
  { label: "Field staff", email: "staff@civicpulse.dev" },
  { label: "Citizen", email: "citizen@civicpulse.dev" },
];
const DEMO_PASSWORD = "Password123!";

export function LoginForm({ showDemo }: { showDemo: boolean }) {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (!res || res.error) {
      setPending(false);
      setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect email or password.");
      return;
    }
    const session = await getSession();
    const fallback = session?.user.role === "CITIZEN" ? "/my-reports" : "/dashboard";
    // Full navigation so every server component (header, menus) renders with the new session.
    window.location.assign(safeCallback(params.get("callbackUrl")) ?? fallback);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {params.get("registered") && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          Account created — sign in to continue.
        </p>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5"
          aria-invalid={!!error}
          aria-describedby={error ? "login-error" : undefined}
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5"
          aria-invalid={!!error}
        />
        <FieldError id="login-error" message={error ?? undefined} />
      </div>
      <Button type="submit" size="lg" disabled={pending || !email || !password}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        New here?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Create a citizen account
        </Link>
      </p>
      {showDemo && (
        <div className="bg-muted/50 rounded-xl border border-dashed p-3">
          <p className="text-muted-foreground text-xs font-medium">
            Demo accounts · password {DEMO_PASSWORD}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DEMO.map((d) => (
              <Button
                key={d.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEmail(d.email);
                  setPassword(DEMO_PASSWORD);
                }}
              >
                {d.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
