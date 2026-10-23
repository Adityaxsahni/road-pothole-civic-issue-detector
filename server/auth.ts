import "server-only";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation";
import { isRateLimited, rateLimit } from "@/lib/rate-limit";
import { isStaff } from "@/lib/roles";
import { prisma } from "./db";

const LOGIN_MAX_FAILURES = 10;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Throttle brute-force attempts per account: only failed attempts count toward the limit.
        if (isRateLimited("login-failures", email, LOGIN_MAX_FAILURES)) {
          throw new Error("Too many failed sign-in attempts. Try again in a few minutes.");
        }

        const user = await prisma.user.findUnique({ where: { email } });
        // Compare against a dummy hash when the user is missing to keep timing uniform.
        const hash = user?.passwordHash ?? "$2b$10$JsB2OZk5n8xBLX3LwZ5XWuXE7hCA60zfpd5ZlgAVz239M.CmdgeBG";
        const valid = await bcrypt.compare(password, hash);
        if (!user || !valid) {
          rateLimit("login-failures", email, LOGIN_MAX_FAILURES, 15 * 60_000);
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          municipalityId: user.municipalityId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.municipalityId = user.municipalityId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.municipalityId = token.municipalityId;
      }
      return session;
    },
  },
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  municipalityId: string | null;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    municipalityId: session.user.municipalityId ?? null,
  };
}

export { isStaff };

/** For server components/pages: redirect to login (or home) when the role requirement fails. */
export async function requireUser(
  options: { staff?: boolean; callbackUrl?: string } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user)
    redirect(`/login${options.callbackUrl ? `?callbackUrl=${encodeURIComponent(options.callbackUrl)}` : ""}`);
  if (options.staff && !isStaff(user)) redirect("/");
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

/** For server actions/route handlers: throw instead of redirecting. */
export async function assertUser(options: { staff?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Authentication required", 401);
  if (options.staff && !isStaff(user)) throw new AuthError("Staff access required", 403);
  return user;
}
