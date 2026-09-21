#!/usr/bin/env bash
# Bootstrap a fresh Debian 12 Compute Engine VM to run CareerReboot's
# career-ops pipeline under cron. Idempotent — safe to re-run.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/CHANGE_ME/CareerReboot.git}"
REPO_DIR="${REPO_DIR:-$HOME/CareerReboot}"

echo "==> Installing system packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates

echo "==> Installing Node 22 (NodeSource) — web/ requires >=22, career-ops core needs >=18"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

if [[ -d "$REPO_DIR/.git" ]]; then
  echo "==> Repo already present at $REPO_DIR, pulling latest"
  git -C "$REPO_DIR" pull --ff-only
else
  echo "==> Cloning $REPO_URL"
  git clone "$REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR/agents/career-ops"

echo "==> Installing npm dependencies (this also fetches Playwright's Chromium)"
npm install

echo "==> Playwright system dependencies for headless Chromium"
npx playwright install-deps chromium

echo "==> Installing rtk (token-usage optimizer for AI CLI tool calls)"
if ! command -v rtk >/dev/null; then
  curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
fi
rtk --version || true
# Wires rtk into whichever AI CLI runs on this box (Claude Code by default).
# Safe to re-run; only needs redoing if you switch CLIs.
rtk init -g || echo "rtk init -g failed — run manually once your AI CLI is installed on this box"

echo "==> Building the web dashboard"
cd "$REPO_DIR/agents/career-ops/web"
npm ci
npm run build

echo "==> Installing career-ops-web systemd service (binds 127.0.0.1 only)"
CURRENT_USER="$(whoami)"
sed -e "s|__USER__|$CURRENT_USER|" -e "s|__HOME__|$HOME|" \
  "$REPO_DIR/deploy/gcp/career-ops-web.service" | sudo tee /etc/systemd/system/career-ops-web.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable career-ops-web
sudo systemctl restart career-ops-web
sleep 2
sudo systemctl --no-pager status career-ops-web || true

cat <<'EOF'

==> Bootstrap done.

Next steps (not automated — these carry secrets/PII, deliberately manual):
  1. Copy .env, config/profile.yml, portals.yml, cv.md onto this box
     (see deploy/gcp/README.md step 3 — gcloud compute scp, not git).
  2. node doctor.mjs --json   # confirm onboarding files are in place
  3. crontab -e               # paste from deploy/gcp/crontab.example
  4. See deploy/gcp/README.md "Accessing the web app" to open the
     dashboard from your laptop via SSH tunnel — it is NOT exposed
     publicly on purpose (no built-in login, holds PII + paid API triggers).
EOF
