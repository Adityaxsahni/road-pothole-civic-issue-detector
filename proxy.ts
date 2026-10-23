import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-of-app route guard (Next.js 16 "proxy", formerly middleware). Pages also re-check the
 * session server-side, and every API route/server action authorises independently — this layer
 * gives fast redirects, not the only line of defence.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (pathname.startsWith("/dashboard") && token.role !== "STAFF" && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/my-reports?denied=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/report/:path*", "/report", "/my-reports/:path*", "/my-reports"],
};
