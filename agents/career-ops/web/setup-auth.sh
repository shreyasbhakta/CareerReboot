#!/usr/bin/env bash
# Configure (or reconfigure) the web dashboard's password gate.
#
# Usage:
#   ./setup-auth.sh                  # generate a random password + secret
#   ./setup-auth.sh "my own password"  # set a specific password, random secret
#
# Safe to re-run — regenerates the session secret each time, which
# invalidates any existing login session (everyone has to log in again).
set -euo pipefail
cd "$(dirname "$0")"

PASSWORD="${1:-$(openssl rand -base64 12 | tr -d '=+/' | cut -c1-16)}"
SECRET="$(openssl rand -hex 32)"
ENV_FILE=".env.local"

# Preserve any other lines already in .env.local (e.g. CAREER_OPS_WEB_ALLOWED_HOSTS).
if [[ -f "$ENV_FILE" ]]; then
  grep -v -E '^CAREER_OPS_WEB_(PASSWORD|SESSION_SECRET)=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

{
  echo "CAREER_OPS_WEB_PASSWORD=$PASSWORD"
  echo "CAREER_OPS_WEB_SESSION_SECRET=$SECRET"
} >> "$ENV_FILE"

chmod 600 "$ENV_FILE"

cat <<EOF

Password gate configured in $ENV_FILE (permissions set to 600 — owner-only read).

  Password: $PASSWORD

Restart the app for it to take effect:
  - Local dev:        Ctrl-C the running \`npm run dev\`, then run it again
  - Local production:  npm run build && npm run start
  - On the GCP VM:     sudo systemctl restart career-ops-web

Every existing login session is now invalid (new session secret) — anyone
using this dashboard needs to log in again with the password above.
EOF
