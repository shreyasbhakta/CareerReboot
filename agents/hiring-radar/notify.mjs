// Optional notification. There is no existing notification infrastructure in
// CareerReboot, so this is a plain JSON webhook (Slack/Discord/Teams-compatible
// "text" payload). Disabled by default; a failure never fails the scan.
import { truncate } from './lib/text.mjs';

export function buildMessage(digest, cfg) {
  const top = [...digest.high, ...digest.active].filter((s) => s.scores.overall >= cfg.notify.min_score).slice(0, cfg.notify.max_items);
  if (!top.length) return null;
  const lines = top.map((s) => {
    const who = s.person?.name ? ` · ${s.person.name}${s.person.title ? ` (${s.person.title})` : ''}` : '';
    const warm = s.warm?.status === 'WARM_INTRO_AVAILABLE' ? ' · 🔥 warm intro' : '';
    return `• ${s.scores.overall}/100 ${s.role?.canonical || s.title} @ ${s.company?.name || '?'}${who}${warm}\n  ${s.sourceUrl}`;
  });
  // Discord caps a message at 2000 characters (Slack allows far more), so stay under the smaller limit.
  return truncate(`Hiring Radar — ${top.length} top signal${top.length === 1 ? '' : 's'}\n${lines.join('\n')}`, 1900);
}

export async function notify({ digest, cfg, env, http, logger }) {
  if (!cfg.notify.enabled) return { sent: false, reason: 'disabled' };
  const url = (env.HIRING_RADAR_WEBHOOK_URL || '').trim();
  if (!url) { logger.warn('notifications enabled but HIRING_RADAR_WEBHOOK_URL is not set; skipping'); return { sent: false, reason: 'no webhook' }; }
  const text = buildMessage(digest, cfg);
  if (!text) return { sent: false, reason: 'nothing above notify.min_score' };
  try {
    await http.postJson(url, { text, content: text });
    return { sent: true };
  } catch (e) {
    logger.warn(`notification failed: ${e.message}`);
    return { sent: false, reason: 'failed' };
  }
}
