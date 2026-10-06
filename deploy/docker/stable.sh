#!/usr/bin/env bash
# Build the stable runtime from a release tag (default: the newest v* tag) and (re)start it.
# Usage: deploy/docker/stable.sh [tag]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(git -C "$here" rev-parse --show-toplevel)"

url="$(git -C "$repo" remote get-url origin)"
tag="${1:-$(git ls-remote --tags --refs --sort=-v:refname "$url" 'v*' | head -n 1 | sed 's#.*refs/tags/##')}"
[ -n "$tag" ] || { echo "No release tag found on $url." >&2; exit 1; }

# A fresh clone of the pushed tag: uncommitted edits and the iCloud-synced .git never reach the build.
ctx="$(mktemp -d)"
trap 'rm -rf "$ctx"' EXIT
git clone --quiet --depth 1 --branch "$tag" "$url" "$ctx"
rm -rf "$ctx/.git"
[ -f "$ctx/deploy/docker/Dockerfile" ] || { echo "$tag predates the Docker runtime; pick a newer tag." >&2; exit 1; }

docker build -f "$ctx/deploy/docker/Dockerfile" --label "careerreboot.tag=$tag" -t "careerreboot:${tag//\//-}" -t careerreboot:stable "$ctx"
docker compose -f "$here/docker-compose.yml" up -d --force-recreate
echo "CareerReboot $tag is up at http://localhost:${CAREERREBOOT_PORT:-3200}"
