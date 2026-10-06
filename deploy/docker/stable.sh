#!/usr/bin/env bash
# Build the stable runtime from a release tag (default: the newest v* tag) and (re)start it.
# Usage: deploy/docker/stable.sh [tag]
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(git -C "$here" rev-parse --show-toplevel)"

git -C "$repo" fetch --tags --quiet 2>/dev/null || echo "Offline; using local tags."
tag="${1:-$(git -C "$repo" tag --list 'v*' --sort=-v:refname | head -n 1)}"
[ -n "$tag" ] || { echo "No release tag found." >&2; exit 1; }
git -C "$repo" cat-file -e "$tag:deploy/docker/Dockerfile" 2>/dev/null \
  || { echo "$tag predates the Docker runtime; pick a newer tag." >&2; exit 1; }

# The build context is the tag's tree, so uncommitted edits and iCloud-evicted node_modules never leak in.
ctx="$(mktemp -d)"
trap 'rm -rf "$ctx"' EXIT
git -C "$repo" archive "$tag" | tar -x -C "$ctx"

docker build -f "$ctx/deploy/docker/Dockerfile" --label "careerreboot.tag=$tag" -t "careerreboot:${tag//\//-}" -t careerreboot:stable "$ctx"
docker compose -f "$here/docker-compose.yml" up -d --force-recreate
echo "CareerReboot $tag is up at http://localhost:${CAREERREBOOT_PORT:-3200}"
