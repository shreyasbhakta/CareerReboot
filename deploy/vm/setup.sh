#!/usr/bin/env bash
# Bootstrap (or update) a Debian/Ubuntu VM — GCP Compute Engine or AWS Lightsail —
# to run CareerReboot's dashboard under systemd and its jobs under cron.
# Idempotent: re-running it is also how you deploy a newer commit.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/CHANGE_ME/CareerReboot.git}"
REPO_DIR="${REPO_DIR:-$HOME/CareerReboot}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

echo "==> Installing system packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates

# Small boxes (GCP e2-micro, 1 GB) run out of memory during `next build` or when a
# Chromium scan overlaps the dashboard; swap turns that crash into a slowdown.
mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
if (( mem_kb < 3 * 1024 * 1024 )) && ! swapon --show=NAME --noheadings | grep -q .; then
  echo "==> Adding ${SWAP_SIZE} swap (RAM under 3 GB)"
  sudo fallocate -l "$SWAP_SIZE" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi

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

echo "==> Installing Hiring Radar dependencies (its daily scan runs from cron)"
npm --prefix "$REPO_DIR/agents/hiring-radar" ci

# Opt-in: rtk only helps an AI CLI running on this box, and its installer is an
# unpinned remote script — not something a server holding your PII runs by default.
if [[ "${INSTALL_RTK:-0}" == "1" ]]; then
  echo "==> Installing rtk (token-usage optimizer for AI CLI tool calls)"
  if ! command -v rtk >/dev/null; then
    curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    # Literal $HOME/$PATH on purpose: expanded by .bashrc at login, not now.
    # shellcheck disable=SC2016
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
  fi
  rtk --version || true
  rtk init -g || echo "rtk init -g failed — run manually once your AI CLI is installed on this box"
fi

echo "==> Building the web dashboard"
cd "$REPO_DIR/agents/career-ops/web"
npm ci
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "==> Installing career-ops-web systemd service (binds 127.0.0.1 only)"
# Optional web settings (e.g. CAREER_OPS_WEB_ALLOWED_HOSTS for Tailscale). Root-only,
# and never overwritten so a re-run keeps your edits.
if [[ ! -f /etc/careerreboot/web.env ]]; then
  sudo install -d -m 700 /etc/careerreboot
  sudo install -m 600 "$REPO_DIR/deploy/vm/web.env.example" /etc/careerreboot/web.env
fi
CURRENT_USER="$(whoami)"
sed -e "s|__USER__|$CURRENT_USER|" -e "s|__HOME__|$HOME|" \
  "$REPO_DIR/deploy/vm/career-ops-web.service" | sudo tee /etc/systemd/system/career-ops-web.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable career-ops-web
sudo systemctl restart career-ops-web
sleep 2
sudo systemctl --no-pager status career-ops-web || true

cat <<'EOF'

==> Bootstrap done.

Next steps (not automated — these carry secrets/PII, deliberately manual):
  1. Copy .env, config/profile.yml, portals.yml, cv.md onto this box
     (deploy/vm/README.md "Supply config and secrets" — scp, never git).
  2. node doctor.mjs --json   # confirm onboarding files are in place
  3. crontab -e               # paste from deploy/vm/crontab.example
  4. Open the dashboard through an SSH tunnel or Tailscale
     (deploy/vm/README.md "Open the dashboard"). It is NOT exposed
     publicly on purpose: no built-in login, holds PII + paid API triggers.
EOF
