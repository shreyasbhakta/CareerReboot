import { ageHours } from '../lib/dates.mjs';

/** Step-decay recency score. Unknown dates get a configurable middling score. */
export function activityScore(publishedAt, cfg, now = new Date()) {
  const hours = ageHours(publishedAt, now);
  const r = cfg.recency;
  if (hours == null) return { score: r.unknown_age_score, ageHours: null, known: false };
  const band = r.bands.find((b) => hours <= b.max_hours);
  return { score: band ? band.score : r.floor_score, ageHours: Math.round(hours * 10) / 10, known: true };
}
