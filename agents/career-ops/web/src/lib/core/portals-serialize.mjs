// Pure serializer for the ephemeral Explorer portals.yml — extracted from
// portals.ts so a `node --test` can load it (the web suite is .mjs and cannot
// import a .ts), matching clean-chips.mjs / profile-keywords.mjs.
//
// Kept dependency-free on purpose: it takes a plain filter-lists object and
// returns YAML text, nothing else. The correctness this guards is that NO
// location tier is silently dropped when the Explorer writes the file the
// scanner reads — the bug block_hard hit (#3102): a tier the type carried but
// the serializer never emitted is a filter the user set and the scan ignored.

/** One YAML list block, or "" when empty. Scalars go through JSON.stringify (a
 *  valid YAML double-quoted scalar) so arbitrary keywords — colons, quotes,
 *  leading dashes — can never break the document or inject YAML. */
function block(key, items) {
  return items.length
    ? `  ${key}:\n` + items.map((k) => `    - ${JSON.stringify(k)}`).join("\n") + "\n"
    : "";
}

/**
 * Serialize filters into a minimal, valid portals.yml.
 *
 * location tiers mirror scan.mjs precedence block_hard > always_allow > block >
 * allow. The `location_filter:` header is emitted when ANY tier is non-empty —
 * block_hard included, or a config that hard-blocks and nothing else would write
 * no location_filter at all and the scan would honor none of it (#3102).
 *
 * @param {{positive:string[], negative:string[], allow:string[], block:string[], alwaysAllow:string[], blockHard:string[], excludeContent:string[], locationStrict:boolean}} f
 * @returns {string}
 */
export function serializePortals(f) {
  let out = "# Ephemeral Explorer filters — generated per-search, safe to delete.\n";
  if (f.positive.length || f.negative.length) {
    out += "title_filter:\n";
    out += block("positive", f.positive);
    out += block("negative", f.negative);
  }
  if (f.blockHard.length || f.allow.length || f.block.length || f.alwaysAllow.length) {
    out += "location_filter:\n";
    out += block("block_hard", f.blockHard);
    out += block("always_allow", f.alwaysAllow);
    out += block("allow", f.allow);
    out += block("block", f.block);
    // Only meaningful (and only emitted) alongside an actual allow list —
    // scan.mjs's buildLocationFilter only consults it when allow is non-empty.
    if (f.allow.length && f.locationStrict) out += "  strict: true\n";
  }
  if (f.excludeContent.length) {
    out += "content_filter:\n";
    out += block("negative", f.excludeContent);
  }
  return out;
}
