# Stable release in Docker

Runs one release tag as an always-on instance on this machine while you edit the checkout.
The image holds the tag's code; your gitignored config and data stay in your checkout and are
linked in, so the stable dashboard and your dev server see the same CV, tracker and scan results.

| | Stable (Docker) | Dev (`npm run dev`) |
|---|---|---|
| Code | the release tag, frozen in the image | your working tree |
| URL | http://localhost:3200 | http://localhost:3111 (or 3000) |
| Scheduled scans | yes, under cron in the container | no |
| AI CLI actions (Claude, Codex, ...) | no: the CLIs and their logins live on the host | yes |

## Start or upgrade

```bash
deploy/docker/stable.sh            # newest v* tag
deploy/docker/stable.sh v2.2.0     # a specific tag
```

The script builds `careerreboot:stable` from a fresh clone of the tag on GitHub, so only pushed,
tagged code reaches the image, then recreates the container. Tags older than the one that added
this folder cannot be used. Rolling back is the same command with the older tag.

`CAREERREBOOT_PORT` (default 3200) and `CAREERREBOOT_TZ` (default America/New_York) override
the port and the cron time zone.

## What is linked from your checkout

Every path in [`personal-paths`](personal-paths) that exists on the host: `.env` files, `cv.md`,
`portals.yml`, `config/profile.yml`, Hiring Radar's `config.yml`, `data/`, `reports/`, `output/`
and the rest. Edits made in either dashboard land in your checkout.

`localhost` URLs in your `.env` files (SearXNG, OmniRoute) are rewritten to
`host.docker.internal`, so the container reaches the services on your Mac.

## Scheduled scans

On first start the container installs the daily Hiring Radar scan at 07:35 (`--days 1`). Change
or remove it from the dashboard's **Schedule** panel; the crontab lives in a Docker volume and
survives upgrades. Output goes to `agents/career-ops/data/hiring-radar-cron.log`. Do not also
schedule the scan on the host, or it runs twice.

## Day to day

```bash
docker compose -f deploy/docker/docker-compose.yml logs -f
docker compose -f deploy/docker/docker-compose.yml down
docker exec careerreboot-stable crontab -l
```

## Caveats

- The stable code and your dev code share one set of data files. A dev branch that changes a
  file format can leave data the older tag cannot read, so release format changes before relying
  on them in dev.
- Docker Desktop only runs while you are logged in and the Mac is awake; for a host that is up
  when the laptop is closed, see `deploy/vm/README.md`.
- With the checkout in iCloud Drive, files iCloud has offloaded stall reads. Keep "Optimize Mac
  Storage" off for this folder, or move the checkout out of iCloud.
