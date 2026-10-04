// Optional notification via a plain JSON webhook (Discord/Slack/Teams-compatible).
// Sends EVERY result of the run (score-ordered), chunked to fit Discord's 2000-char
// message limit, so nothing is hidden behind a threshold. A failure never fails the scan.
import { truncate } from './lib/text.mjs';

const LIMIT = 1900;

function line(s) {
  const who = s.person?.name ? ` · ${s.person.name}${s.person.title ? ` (${s.person.title})` : ''}` : '';
  const warm = s.warm?.status === 'WARM_INTRO_AVAILABLE' ? ' · 🔥 warm intro' : s.warm?.status === 'COMPANY_CONNECTION' ? ' · knows someone there' : '';
  const where = s.location ? ` · ${truncate(s.location, 30)}` : '';
  return `**${s.scores.overall}** ${truncate(s.role?.canonical || s.title || 'Engineering role', 40)} @ ${truncate(s.company?.name || '?', 28)}${where}${who}${warm}\n<${s.sourceUrl}>`;
}

/** Items to announce: this run's NEW results (or everything shown, with scope "all"), best first. */
export function selectItems(digest, cfg) {
  const n = cfg.notify;
  const pool = n.scope === 'all' ? digest.ranked : digest.ranked.filter((s) => s.status === 'NEW');
  const floor = n.min_score ?? 0;
  return pool.filter((s) => s.scores.overall >= floor).slice(0, n.max_items);
}

/** @returns {string[]} messages, each ≤ 1900 chars; a one-line heartbeat when nothing is new. */
export function buildMessages(digest, cfg, summary) {
  const items = selectItems(digest, cfg);
  if (!items.length) {
    if (!cfg.notify.heartbeat) return [];
    const s = summary || {};
    return [`Hiring Radar: scan finished — no new results (${s.discovered ?? '?'} checked, ${s.deduplicated ?? '?'} already seen). ${digest.ranked.length} remain on your list.`];
  }
  const header = `**Hiring Radar — ${items.length} new result${items.length === 1 ? '' : 's'}** (score · role @ company)`;
  const msgs = [];
  let cur = header;
  for (const it of items) {
    const l = line(it);
    if (cur.length + l.length + 2 > LIMIT) { msgs.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + truncate(l, LIMIT);
  }
  if (cur) msgs.push(cur);
  return msgs;
}

// Kept for callers/tests that want a single string.
export const buildMessage = (digest, cfg, summary) => buildMessages(digest, cfg, summary)[0] ?? null;

export async function notify({ digest, cfg, env, http, logger, summary, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!cfg.notify.enabled) return { sent: false, reason: 'disabled' };
  const url = (env.HIRING_RADAR_WEBHOOK_URL || '').trim();
  if (!url) { logger.warn('notifications enabled but HIRING_RADAR_WEBHOOK_URL is not set; skipping'); return { sent: false, reason: 'no webhook' }; }
  const msgs = buildMessages(digest, cfg, summary);
  if (!msgs.length) return { sent: false, reason: 'nothing to announce' };
  let sent = 0;
  try {
    for (const text of msgs) {
      await http.postJson(url, { text, content: text });
      sent++;
      if (sent < msgs.length) await sleep(700);   // stay under Discord's webhook rate limit
    }
    return { sent: true, messages: sent, items: selectItems(digest, cfg).length };
  } catch (e) {
    logger.warn(`notification failed after ${sent}/${msgs.length} message(s): ${e.message}`);
    return { sent: sent > 0, reason: 'failed', messages: sent };
  }
}
