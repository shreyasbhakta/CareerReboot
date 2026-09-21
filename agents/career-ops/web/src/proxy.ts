import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRequest,
  parseAllowedHosts,
  parseAllowedOrigins,
} from "@/lib/origin-guard.mjs";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session.mjs";

// Single choke point over the whole app. Two independent gates:
//
// 1. Origin guard (/api/* only, unchanged from upstream) — same-origin +
//    loopback check before a route handler that may spawn a child process or
//    write the user's files. See origin-guard.mjs for the F1/F2 rationale.
//
// 2. Session gate (everything except /login and its own API) — a single
//    shared-password cookie check. Opt-in: if CAREER_OPS_WEB_PASSWORD /
//    CAREER_OPS_WEB_SESSION_SECRET aren't set, this fails OPEN (no gate) so
//    local dev keeps working with zero setup. Set both before ever exposing
//    this beyond your own SSH tunnel — see deploy/gcp/README.md.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function proxy(req: NextRequest) {
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

  const password = process.env.CAREER_OPS_WEB_PASSWORD;
  const secret = process.env.CAREER_OPS_WEB_SESSION_SECRET;
  const gateConfigured = Boolean(password && secret);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (gateConfigured && !isPublic) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const valid = token ? await verifySessionToken(token, secret!) : false;
    if (!valid) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon).*)"],
};
