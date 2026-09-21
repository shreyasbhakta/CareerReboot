# SearXNG (local, for `find-hiring-manager.mjs`)

A self-hosted, privacy-respecting metasearch engine (no tracking, no API key)
that `find-hiring-manager.mjs` queries to surface candidate hiring-manager /
team profiles for a company — the mechanism that previously didn't exist
(the web UI's "Find hiring manager" button used to be a disabled stub).

## Start / stop

```bash
cd deploy/searxng
docker compose up -d      # start (pulls the image on first run)
docker compose down       # stop
docker compose logs -f    # tail logs
```

Runs at `http://localhost:8888`, bound to `127.0.0.1` only — **never expose
this port publicly.** The JSON API is enabled and its rate limiter disabled
(`searxng-data/settings.yml`) specifically because this instance is private
and single-user; doing that on a publicly reachable instance would let
anyone use it as an open, untracked search proxy.

## Verify it's working

```bash
curl -s "http://localhost:8888/search?q=test&format=json" | head -c 200
```

## Config

Set `SEARXNG_URL` in the repo root `.env` (defaults to `http://localhost:8888`
if unset — see `.env.example`). `find-hiring-manager.mjs` reports a clear
"SearXNG not configured/reachable" error rather than a confusing failure when
this isn't running.

## Data

`searxng-data/` holds SearXNG's own generated config (`settings.yml`) —
gitignored, machine-local, safe to delete and regenerate (`docker compose up
-d` recreates it with defaults, so re-apply the `search.formats` /
`server.limiter` overrides above if you do).
