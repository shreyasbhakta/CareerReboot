// Small, dependency-free text helpers shared by every stage.
import { createHash } from 'node:crypto';

const TRACKING_PARAMS = /^(utm_.*|gclid|fbclid|msclkid|mc_[a-z]+|ref|ref_src|source|src|trk|trkinfo|trackingid|rcm|lipi|midtoken|midsig|originalsubdomain|gh_src|gh_jid_src|lever-source|lever-origin|ashby_jid_src)$/i;

/**
 * Canonical form of a URL for dedup: https, no www/country subdomain on
 * LinkedIn, no fragment, no tracking params, sorted query, no trailing slash.
 * Returns '' for anything that is not an http(s) URL.
 */
export function canonicalUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u;
  try { u = new URL(raw.trim()); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  let host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (/(^|\.)linkedin\.com$/.test(host)) host = 'linkedin.com';
  const isLinkedIn = host === 'linkedin.com';
  const params = [];
  if (!isLinkedIn) {
    for (const [k, v] of u.searchParams) if (!TRACKING_PARAMS.test(k)) params.push([k, v]);
    params.sort(([a], [b]) => a.localeCompare(b));
  }
  const path = u.pathname.replace(/\/+$/, '') || '';
  const qs = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
  return `https://${host}${path}${qs}`;
}

/** Lowercase, strip punctuation/URLs/emoji, collapse whitespace. For fuzzy keys. */
export function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha1(s) {
  return createHash('sha1').update(String(s)).digest('hex');
}

export function shortHash(s, n = 12) {
  return sha1(s).slice(0, n);
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<\/?(?:p|br|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function truncate(s, n) {
  const t = String(s ?? '');
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

/** Escape a string for use inside a RegExp. */
export function reEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-ish boundary regex for a skill/alias term. Unlike \b it treats + # . as
 * part of the token so "c++" / "node.js" work and "java" never matches
 * "javascript".
 */
export function termRegex(term) {
  const body = reEscape(term.trim()).replace(/\\? /g, '[\\s\\-]+');
  return new RegExp(`(?<![a-z0-9+#])${body}(?![a-z0-9+#])`, 'i');
}

export function clamp(n, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, n));
}

export function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
