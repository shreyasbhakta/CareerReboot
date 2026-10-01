// Structured, secret-safe logging. Every line is prefixed [HiringRadar] and
// passed through redact() so a stray URL with ?api_key=… or an env value never
// reaches CI logs.

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|WEBHOOK|COOKIE|AUTH)/i;

export function redact(text, env = process.env) {
  let out = String(text ?? '');
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_ENV.test(k) && typeof v === 'string' && v.length >= 8) out = out.split(v).join('***');
  }
  return out
    .replace(/([?&](?:api[_-]?key|key|token|access_token|secret|auth)=)[^&\s]+/gi, '$1***')
    .replace(/(authorization:\s*(?:bearer|basic)\s+)\S+/gi, '$1***')
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,})\b/g, '***');
}

export function createLogger({ verbose = false, sink = console.error, env = process.env } = {}) {
  const emit = (level, msg) => sink(redact(`[HiringRadar] ${level ? level + ': ' : ''}${msg}`, env));
  return {
    info: (m) => emit('', m),
    warn: (m) => emit('WARN', m),
    error: (m) => emit('ERROR', m),
    debug: (m) => { if (verbose) emit('debug', m); },
  };
}
