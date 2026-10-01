import { formatEt, humanAge } from '../lib/dates.mjs';

const TYPE_LABEL = {
  DIRECT_HIRING_POST: 'Direct hiring post', HIRING_ANNOUNCEMENT: 'Hiring announcement', JOB_POSTING: 'Job posting',
  HIRING_MANAGER_ASSOCIATION: 'Hiring manager association', COMPANY_HIRING_SPIKE: 'Recent hiring activity increased',
  RECRUITER_ACTIVITY: 'Recruiter activity', TEAM_EXPANSION: 'Team expansion', NEW_ROLE_CLUSTER: 'Several matching roles open', OTHER: 'Other',
};

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

function personLine(p) {
  if (!p?.name) return 'not identified';
  const bits = [p.name, p.title].filter(Boolean).join(' — ');
  return `${bits}${p.url ? ` (${p.url})` : ''} · confidence ${p.confidence}`;
}

function warmLine(w) {
  if (!w || w.status === 'NO_CONNECTION') return w?.note ? `none known (${w.note})` : 'none known';
  const names = w.connections.map((c) => `${c.name}${c.title ? ` — ${c.title}` : ''}${c.company ? ` at ${c.company}` : ''}`).join('; ');
  return `${w.status === 'WARM_INTRO_AVAILABLE' ? '🔥 ' : ''}${names}`;
}

function item(s, i) {
  const c = s.scores.components;
  const lines = [
    `${i}. **${s.role?.canonical || s.title || 'Engineering role'} — ${s.company?.name || 'Unknown company'}**${s.status === 'NEW' ? ' 🆕' : ''}`,
    `   - Overall match: **${s.scores.overall}/100** (technical ${c.technical} · activity ${c.activity} · direct language ${c.direct_language} · person ${c.person} · location ${c.location} · company ${c.company})`,
    `   - Hiring signal: ${TYPE_LABEL[s.signalType] || s.signalType} (${s.source})`,
    `   - Signal age: ${humanAge(s.ageHours)}${s.dateKnown === false ? ' (no publish date exposed)' : ''}`,
    `   - Location: ${s.location || 'not stated'}`,
    `   - Hiring person: ${personLine(s.person)}`,
    `   - Warm connection: ${warmLine(s.warm)}`,
    `   - Link: ${s.sourceUrl}`,
    `   - Signal: "${clip(s.text, 260)}"`,
    `   - Why this matches: ${(s.why?.length ? s.why : ['Role/skill overlap']).join('; ')}`,
    `   - Score detail: ${s.technicalBreakdown.map((b) => `${b.label} ${b.points >= 0 ? '+' : ''}${b.points}`).join(', ')}`,
    `   - Recommended action: **${s.outreach?.action || 'Review'}**`,
    `   - Suggested outreach angle (draft only, nothing is sent): ${s.outreach?.angle || 'n/a'}`,
  ];
  if (s.llmWhy) lines.splice(10, 0, `   - Model note: ${s.llmWhy}`);
  return lines.join('\n');
}

function section(title, list, empty) {
  if (!list.length) return `## ${title}\n\n_${empty}_\n`;
  return `## ${title}\n\n${list.map((s, i) => item(s, i + 1)).join('\n\n')}\n`;
}

export function toMarkdown({ digest, summary, generatedAt, days }) {
  const d = digest.summary;
  const out = [
    '# Hiring Radar',
    '',
    `Updated: ${formatEt(generatedAt)} · window: last ${days} day${days === 1 ? '' : 's'}`,
    '',
    section('🔥 High Signal', digest.high, 'Nothing cleared the high-signal bar today.'),
    section('🟢 Active Hiring', digest.active, 'No other active hiring signals today.'),
    section('🟡 Relevant Jobs', digest.jobs, 'No additional relevant jobs today.'),
    '## 📊 Summary',
    '',
    `- New direct hiring signals: ${d.newDirectHiringSignals}`,
    `- New relevant jobs: ${d.newRelevantJobs}`,
    `- New hiring people: ${d.newHiringPeople}`,
    `- Warm opportunities: ${d.warmOpportunities}`,
    `- Companies showing increased activity: ${d.companiesWithIncreasedActivity.length ? d.companiesWithIncreasedActivity.join(', ') : 'none'}`,
    '',
    '### Scan',
    '',
    `- Sources attempted: ${summary.sourcesAttempted.join(', ') || 'none'}`,
    `- Sources successful: ${summary.sourcesSuccessful.join(', ') || 'none'}`,
    `- Sources failed/skipped: ${summary.sourcesFailed.map((f) => `${f.source} (${f.error})`).join('; ') || 'none'}`,
    `- Signals discovered: ${summary.discovered} · deduplicated: ${summary.deduplicated} · retained: ${summary.retained}`,
    `- Requests: ${summary.requests} · model calls: ${summary.modelCalls} · runtime: ${summary.runtimeSeconds}s`,
    '',
  ];
  return out.join('\n');
}
