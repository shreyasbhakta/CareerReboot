// The only two places an LLM is used. Inputs are truncated post text plus a
// minimal profile summary — never contact details, phone, email or address.
import { truncate } from '../lib/text.mjs';

export function profileSummary(cfg) {
  const roles = cfg.profile.target_roles || cfg.role_families.filter((f) => f.tier === 'target').map((f) => f.label);
  const skills = Object.values(cfg.technical.skills).flat().filter((s) => s.points >= 3).map((s) => s.name);
  return `Target roles: ${roles.join(', ')}. Strong skills: ${skills.join(', ')}. Mid-level (about 3 years), US-based, open to NYC/NJ, remote US, relocation.`;
}

const SYSTEM_CLASSIFY = 'You classify short public posts. Reply with ONLY a JSON object: {"is_hiring": boolean, "role": string|null, "confidence": number 0-1, "reason": string<=140 chars}. is_hiring is true only if the author is actively recruiting for a specific or clearly implied engineering role right now. Announcements of new hires, congratulations, job seekers, and generic company news are false.';

export async function classifyAmbiguous(llm, { text, company }) {
  const res = await llm.complete({
    task: 'classify',
    system: SYSTEM_CLASSIFY,
    user: `Company (may be empty): ${company || 'unknown'}\nPost:\n"""${truncate(text, 1200)}"""`,
    validate: (o) => {
      if (typeof o.is_hiring !== 'boolean') throw new Error('is_hiring missing');
      const confidence = Number(o.confidence);
      if (!(confidence >= 0 && confidence <= 1)) throw new Error('confidence out of range');
      return { isHiring: o.is_hiring, role: typeof o.role === 'string' ? o.role.slice(0, 80) : null, confidence, reason: String(o.reason || '').slice(0, 160) };
    },
  });
  return res.ok ? res.data : null;
}

const SYSTEM_EXPLAIN = 'You help a software engineer decide whether to reach out about a hiring signal. Reply with ONLY JSON: {"why": string<=220 chars, "outreach_angle": string<=240 chars}. Use only facts given. Do not invent people, employers, or achievements.';

export async function explainMatch(llm, cfg, signal) {
  const proof = (cfg.profile.proof_points || []).map((p) => `${p.name}: ${p.hero_metric}`).slice(0, 4).join(' | ');
  const res = await llm.complete({
    task: 'explain',
    system: SYSTEM_EXPLAIN,
    user: `Candidate: ${profileSummary(cfg)}\nProof points: ${proof || 'n/a'}\nSignal: ${signal.role?.canonical || signal.title} at ${signal.company?.name || 'unknown company'} (${signal.location || 'location unknown'}).\nMatched skills: ${(signal.matchedSkills || []).join(', ') || 'none'}.\nText:\n"""${truncate(signal.text, 900)}"""`,
    validate: (o) => {
      if (!o.why || !o.outreach_angle) throw new Error('missing fields');
      return { why: String(o.why).slice(0, 240), outreachAngle: String(o.outreach_angle).slice(0, 260) };
    },
  });
  return res.ok ? res.data : null;
}
