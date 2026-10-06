#!/bin/sh
# Start the stable runtime: link personal files from the host, start cron, serve the dashboard.
set -eu

HOST=/host
APP=/app

while IFS= read -r p; do
  case "$p" in '' | '#'*) continue ;; esac
  [ -e "$HOST/$p" ] || continue
  rm -rf "${APP:?}/$p"
  mkdir -p "$(dirname "$APP/$p")"
  ln -s "$HOST/$p" "$APP/$p"
done < "$APP/deploy/docker/personal-paths"

ln -sf "/usr/share/zoneinfo/${TZ:-UTC}" /etc/localtime

# Services the host runs on its loopback (SearXNG, OmniRoute) are host.docker.internal from here.
# Cron jobs start with an empty environment, so these go at the top of the crontab.
ENV_BEGIN="# BEGIN careerreboot-docker-env"
ENV_END="# END careerreboot-docker-env"
RADAR_BEGIN="# BEGIN careerreboot-hiring-radar"
first_start=true
crontab -l >/dev/null 2>&1 && first_start=false
current=$(crontab -l 2>/dev/null | sed "/^$ENV_BEGIN\$/,/^$ENV_END\$/d" || true)
{
  echo "$ENV_BEGIN"
  echo "PATH=$PATH"
  echo "TZ=${TZ:-UTC}"
  cat "$HOST"/agents/*/.env 2>/dev/null \
    | grep -E '^[A-Z_]+=https?://(localhost|127\.0\.0\.1)' \
    | sed -E 's#//(localhost|127\.0\.0\.1)#//host.docker.internal#' || true
  echo "$ENV_END"
  [ -n "$current" ] && echo "$current"
  # First start only: the daily Hiring Radar scan. Edit or remove it from the dashboard's Schedule panel.
  if $first_start; then
    echo "$RADAR_BEGIN"
    echo "35 7 * * * cd '$APP/agents/hiring-radar' && '$(command -v node)' scan.mjs --days 1 --source all >> '$APP/agents/career-ops/data/hiring-radar-cron.log' 2>&1"
    echo "# END careerreboot-hiring-radar"
  fi
} | crontab -

# The same loopback rewrite for scans started from the dashboard.
for kv in $(crontab -l | sed -n "/^$ENV_BEGIN\$/,/^$ENV_END\$/p" | grep -E '^[A-Z_]+=https?://host\.docker\.internal[^[:space:]]*$' || true); do
  export "$kv"
done

cron
cd "$APP/agents/career-ops/web"
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
