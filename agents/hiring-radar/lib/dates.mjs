// Date parsing and age helpers. Accepts ISO strings, RFC 2822, epoch ms/s,
// and the relative forms search engines emit ("3 hours ago", "2d", "yesterday").

const UNIT_MS = {
  s: 1e3, sec: 1e3, second: 1e3, m: 60e3, min: 60e3, minute: 60e3,
  h: 36e5, hr: 36e5, hour: 36e5, d: 864e5, day: 864e5, w: 6048e5, wk: 6048e5, week: 6048e5,
  mo: 2592e6, month: 2592e6, y: 31536e6, yr: 31536e6, year: 31536e6,
};

/**
 * @param {unknown} input
 * @param {Date} [now]
 * @returns {Date|null} null when the value cannot be interpreted.
 */
export function parseDate(input, now = new Date()) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    return new Date(input < 1e11 ? input * 1000 : input);
  }
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) return parseDate(Number(s), now);

  if (/\b(just now|moments? ago|today)\b/.test(s) && !/\d/.test(s)) return new Date(now);
  if (/\byesterday\b/.test(s)) return new Date(now.getTime() - 864e5);

  const rel = s.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|years?|yrs?|mo|s|m|h|d|w|y)\s*(?:ago)?\b/);
  if (rel && (/\bago\b/.test(s) || /^\s*(posted\s+)?\d+\s*[a-z]{1,3}\s*$/.test(s) || /^\d+\s*(s|m|h|d|w|y|mo)\b/.test(s))) {
    const unit = rel[2].replace(/s$/, '');
    const ms = UNIT_MS[unit] ?? UNIT_MS[rel[2]];
    if (ms) return new Date(now.getTime() - Number(rel[1]) * ms);
  }

  const t = Date.parse(String(input));
  return Number.isNaN(t) ? null : new Date(t);
}

/** Age in hours, never negative; null when the date is unknown. */
export function ageHours(date, now = new Date()) {
  const d = date instanceof Date ? date : parseDate(date, now);
  if (!d) return null;
  return Math.max(0, (now.getTime() - d.getTime()) / 36e5);
}

export function humanAge(hours) {
  if (hours == null) return 'date unknown';
  if (hours < 1) return 'under 1 hour';
  if (hours < 48) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

/** "2026-10-01 07:30 ET" in America/New_York. */
export function formatEt(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, p) => ((a[p.type] = p.value), a), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute} ET`;
}
