import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRequest,
  parseAllowedHosts,
  parseAllowedOrigins,
} from "@/lib/origin-guard.mjs";

// Origin guard for /api/*: same-origin + loopback only (see origin-guard.mjs), because API routes
// can spawn processes and write the user's files. There is no sign-in: the app is local-first and
// must stay bound to localhost (or an SSH tunnel). Re-add authentication before any shared hosting.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const decision = checkRequest({
      secFetchSite: req.headers.get("sec-fetch-site"),
      origin: req.headers.get("origin"),
      host: req.headers.get("host"),
      allowedHosts: parseAllowedHosts(process.env.CAREER_OPS_WEB_ALLOWED_HOSTS),
      allowedOrigins: parseAllowedOrigins(process.env.CAREER_OPS_ALLOWED_ORIGINS),
    });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon).*)"],
};
