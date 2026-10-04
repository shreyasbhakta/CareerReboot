import { secondDegreeSearchUrl } from '../storage/connections.mjs';

// Machine-readable output for the dashboard. Normalized signals, full score
// breakdowns, no contact emails or raw connection exports.
export function toPublicSignal(s) {
  return {
    id: s.id,
    source: s.source,
    sourceUrl: s.sourceUrl,
    signalType: s.signalType,
    person: s.person ? { name: s.person.name, title: s.person.title || null, url: s.person.url || null, confidence: s.person.confidence } : null,
    company: { name: s.company?.name || null, url: s.company?.url || null, confidence: s.company?.confidence || 'LOW' },
    role: { raw: s.role?.raw || null, canonical: s.role?.canonical || null, tier: s.role?.tier || 'unknown' },
    location: s.location || null,
    text: s.text,
    publishedAt: s.publishedAt,
    discoveredAt: s.discoveredAt,
    confidence: s.confidence,
    status: s.status,
    scores: {
      overall: s.scores.overall,
      components: s.scores.components,
      weights: s.scores.weights,
      technicalBreakdown: s.technicalBreakdown,
    },
    metadata: {
      ageHours: s.ageHours ?? null,
      dateKnown: Boolean(s.dateKnown),
      directStrength: s.directStrength,
      matchedSkills: s.matchedSkills,
      locationKind: s.locationKind,
      warm: s.warm ? { status: s.warm.status, connections: (s.warm.connections || []).map((c) => ({ name: c.name, title: c.title, company: c.company })), note: s.warm.note } : { status: 'NO_CONNECTION', connections: [] },
      why: s.why,
      secondDegreeUrl: s.company?.name ? secondDegreeSearchUrl(s.company.name) : null,
      suggestedAction: s.outreach?.action,
      outreachAngle: s.outreach?.angle,
      ...(s.metadata?.hnUser ? { hnUser: s.metadata.hnUser } : {}),
      ...(s.metadata?.titles ? { titles: s.metadata.titles, jobCount: s.metadata.jobCount } : {}),
    },
  };
}

export function toJson({ digest, summary, config, generatedAt, days, dryRun }) {
  return {
    schema: 'hiring-radar/v1',
    generatedAt: generatedAt.toISOString(),
    windowDays: days,
    dryRun: Boolean(dryRun),
    scan: summary,
    digest: digest.summary,
    signals: digest.ranked.map(toPublicSignal),
  };
}
