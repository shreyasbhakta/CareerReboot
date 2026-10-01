// Builds normalized signal objects and the dedup keys used across runs.
import { canonicalUrl, normalizeText, shortHash } from '../lib/text.mjs';
import { createHash } from 'node:crypto';

export const SIGNAL_TYPES = [
  'DIRECT_HIRING_POST', 'HIRING_ANNOUNCEMENT', 'JOB_POSTING', 'HIRING_MANAGER_ASSOCIATION',
  'COMPANY_HIRING_SPIKE', 'RECRUITER_ACTIVITY', 'TEAM_EXPANSION', 'NEW_ROLE_CLUSTER', 'OTHER',
];
export const STATUSES = ['NEW', 'SEEN', 'REVIEWED', 'CONTACTED', 'DISMISSED', 'CONVERTED'];

const companyKey = (c) => normalizeText(c?.name ?? c ?? '').replace(/\b(inc|llc|ltd|corp|co|company|technologies|technology|labs?)\b/g, '').replace(/\s+/g, '');
const roleKey = (r) => normalizeText(r?.canonical || r?.raw || r || '');

/**
 * Keys that identify "the same signal". Two signals are duplicates if ANY key
 * matches: (1) canonical URL, (2) company+role+person within the same date
 * window, (3) company+role+normalized text fingerprint.
 */
export function dedupKeys(signal, { windowDays = 7 } = {}) {
  const keys = [];
  const url = canonicalUrl(signal.sourceUrl);
  if (url) keys.push(`url:${url}`);
  const co = companyKey(signal.company);
  const role = roleKey(signal.role);
  const person = normalizeText(signal.person?.name || '');
  const t = signal.publishedAt ? Date.parse(signal.publishedAt) : NaN;
  const bucket = Number.isNaN(t) ? 'nodate' : Math.floor(t / (windowDays * 864e5));
  if (co && role && person) keys.push(`cpr:${co}|${role}|${person}|${bucket}`);
  const fp = normalizeText(signal.text).split(' ').slice(0, 40).join(' ');
  if (co && role && fp.length > 20) keys.push(`txt:${co}|${role}|${shortHash(fp, 16)}`);
  // Job postings: one row per (company, normalized title, location) regardless of URL params/boards.
  if (signal.signalType === 'JOB_POSTING' && co && role) keys.push(`job:${co}|${normalizeText(signal.title || '')}|${normalizeText(signal.location || '')}`);
  return keys;
}

export function signalId(signal) {
  const base = canonicalUrl(signal.sourceUrl) || `${companyKey(signal.company)}|${roleKey(signal.role)}|${normalizeText(signal.text).slice(0, 80)}`;
  return createHash('sha1').update(`${signal.source}|${base}|${signal.signalType}`).digest('hex').slice(0, 16);
}

/** Remove duplicates (keeping the first / highest-scored) and report how many were dropped. */
export function dedupeSignals(signals, { windowDays = 7, known = new Set() } = {}) {
  const seen = new Set(known);
  const kept = [];
  let dropped = 0;
  for (const s of signals) {
    const keys = dedupKeys(s, { windowDays });
    if (keys.some((k) => seen.has(k))) { dropped++; continue; }
    keys.forEach((k) => seen.add(k));
    kept.push(s);
  }
  return { kept, dropped };
}
