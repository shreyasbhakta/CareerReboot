import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, COOKIE_NAME, DEFAULT_TTL_SECONDS } from "@/lib/session.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time-ish compare: full-length loop, no early return. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.CAREER_OPS_WEB_PASSWORD;
  const secret = process.env.CAREER_OPS_WEB_SESSION_SECRET;
  if (!expected || !secret) {
    return NextResponse.json(
      { error: "Auth not configured — set CAREER_OPS_WEB_PASSWORD and CAREER_OPS_WEB_SESSION_SECRET in web/.env.local" },
      { status: 500 },
    );
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const submitted = body.password ?? "";

  // Compare HMAC digests rather than raw strings so both inputs are
  // fixed-length before the timing-safe loop runs.
  const [submittedDigest, expectedDigest] = await Promise.all([
    hmacHex(secret, submitted),
    hmacHex(secret, expected),
  ]);
  if (!timingSafeEqual(submittedDigest, expectedDigest)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEFAULT_TTL_SECONDS,
    // Not forcing `secure`: this app is reached over plain-http localhost
    // (SSH tunnel) or Tailscale by design (see deploy/gcp/README.md) — set
    // CAREER_OPS_WEB_COOKIE_SECURE=1 if you ever put real TLS in front of it.
    secure: process.env.CAREER_OPS_WEB_COOKIE_SECURE === "1",
  });
  return res;
}
