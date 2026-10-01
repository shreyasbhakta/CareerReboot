// Deterministic "why it matches" + outreach angle. Draft-only context — this
// module never contacts anyone. Proof points come from career-ops' profile.yml.

export function proofPointsFor(groups, matchedSkills, cfg) {
  const kw = cfg.outreach?.group_proof_keywords || {};
  const wanted = new Set(groups.flatMap((g) => kw[g] || []));
  return (cfg.profile.proof_points || []).filter((p) => {
    const hay = `${p.name} ${p.hero_metric}`.toLowerCase();
    return [...wanted].some((w) => hay.includes(w));
  });
}

export function suggestedAction(signal, cfg) {
  const warm = signal.warm?.status;
  const hasPerson = signal.person?.name && signal.person.confidence !== 'LOW';
  if (warm === 'WARM_INTRO_AVAILABLE') return 'Ask your connection for an intro';
  if (hasPerson && ['DIRECT_HIRING_POST', 'RECRUITER_ACTIVITY', 'TEAM_EXPANSION'].includes(signal.signalType)) return 'Reach out directly';
  if (hasPerson) return 'Reach out directly, then apply';
  if (signal.signalType === 'COMPANY_HIRING_SPIKE' || signal.signalType === 'NEW_ROLE_CLUSTER') return 'Research the team, then apply to the best-fit role';
  return 'Apply, then look for a hiring contact';
}

export function buildWhy(signal) {
  const reasons = [];
  if (signal.role?.canonical) reasons.push(`Role maps to ${signal.role.canonical}`);
  const skills = (signal.matchedSkills || []).slice(0, 6);
  if (skills.length) reasons.push(`Mentions ${skills.join(', ')}`);
  if (signal.locationKind === 'home') reasons.push('Location matches NYC/NJ');
  else if (signal.locationKind === 'remote_us') reasons.push('Remote-friendly in the US');
  return reasons;
}

export function outreachAngle(signal, cfg) {
  const proofs = proofPointsFor(signal.skillGroups || [], signal.matchedSkills || [], cfg);
  const role = signal.role?.canonical || 'this role';
  if (!proofs.length) return `Lead with your closest experience to ${role} and name the specific skills the post mentions.`;
  const p = proofs[0];
  return `Your ${p.name} work (${p.hero_metric}) maps directly to the ${role} scope at ${signal.company?.name || 'the company'}.`;
}
