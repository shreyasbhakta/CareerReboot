// Single-password session gate for this personal instance. Not multi-tenant
// auth — one shared password, one signed cookie, protecting the whole app
// when it's reachable beyond your own SSH tunnel (Tailscale, a LAN box).
// Uses Web Crypto (crypto.subtle) so the same code runs in both the Edge
// middleware (proxy.ts) and Node API routes without a runtime split.

const COOKIE_NAME = "cr_session";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function toBase64Url(bytes) {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), "=");
  const str = atob(b64);
  return Uint8Array.from(str, (c) => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Mint a signed session token: `{expiresAt}.{signature}`. */
export async function createSessionToken(secret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = String(expiresAt);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payload, sigB64] = token.split(".");
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  try {
    const key = await hmacKey(secret);
    const sig = fromBase64Url(sigB64);
    return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

export { COOKIE_NAME, DEFAULT_TTL_SECONDS };
