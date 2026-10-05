# Deploying to a VM (GCP or AWS)

Nothing is hosted today. This folder keeps CareerReboot ready to deploy the day
you want to pay for it, and CI keeps it that way: every pull request runs the
production `next build` and lints these scripts (`.github/workflows/ci.yml`,
"Deploy readiness"), so any green commit on `main` can be deployed as-is.

The shape is one small always-on Linux VM: `systemd` runs the `web/`
dashboard, `cron` runs the scans, and everything is stored as files on the
VM's disk. No GPU, no local LLM; the agents call hosted models. Serverless
hosts (Cloud Run, Lambda, Firebase, Vercel) do not fit: they discard local
files on restart and cannot run cron or long Chromium scans.

## 1. Choose a host

| Host | Size | Monthly cost | When to pick it |
|---|---|---|---|
| **AWS Lightsail** "General Purpose 3" | 2 vCPU, 2 GB, 60 GB SSD, 3 TB transfer, static IPv4 | **$12 flat** (first 3 months free) | Recommended: predictable bill, IP and disk included. |
| GCP Compute Engine `e2-micro` | 0.25–2 shared vCPU, 1 GB, 30 GB standard disk | **$0** VM (Always Free, us-central1/us-east1/us-west1); public IPv4 may add ~$3.65 | Trying it for free. Slow; relies on swap. |
| GCP Compute Engine `e2-small` | 2 shared vCPU, 2 GB | ~$12.23 VM + ~$3.65 IPv4 + ~$2 disk ≈ **$18** | You prefer GCP. |

Prices are us-east/us-central on-demand list prices as of October 2026; check
[Lightsail pricing](https://aws.amazon.com/lightsail/pricing) and
[Compute Engine pricing](https://cloud.google.com/compute/vm-instance-pricing)
before you create anything. Model API spend is separate and usually larger.

## 2. Create the VM

All commands run against your own account; this repo holds no project IDs,
account IDs or credentials.

**AWS Lightsail** (`aws configure` first):

```bash
aws lightsail create-instances --instance-names career-reboot \
  --availability-zone us-east-1a --blueprint-id debian_12 --bundle-id small_3_0
# Lightsail opens HTTP (80) by default. Close everything but SSH:
aws lightsail put-instance-public-ports --instance-name career-reboot \
  --port-infos fromPort=22,toPort=22,protocol=tcp
```

Bundle IDs change over time; confirm with `aws lightsail get-bundles`. Restrict
SSH to your own IP in the Lightsail console if you can.

**GCP** (`gcloud auth login`, `gcloud config set project YOUR-PROJECT-ID`,
billing linked, `gcloud services enable compute.googleapis.com`):

```bash
# Free tier: e2-micro + pd-standard (up to 30 GB) in us-central1, us-east1 or us-west1.
gcloud compute instances create career-reboot \
  --zone=us-central1-a --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=30GB --boot-disk-type=pd-standard
```

For `e2-small`, change `--machine-type` (the disk can stay `pd-standard`). No
firewall rule is needed: the dashboard binds to `127.0.0.1` only.

## 3. Bootstrap

SSH in (`ssh admin@<ip>` with the Lightsail key, or `gcloud compute ssh
career-reboot --zone=us-central1-a`). The repository is private, so give the VM
**read-only** access with a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
rather than your personal credentials:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519   # add the .pub as a read-only deploy key
ssh-keyscan github.com >> ~/.ssh/known_hosts        # compare with GitHub's published SSH fingerprints
```

Then, from your laptop, copy the script up and run it:

```bash
scp deploy/vm/setup.sh admin@<ip>:~/setup.sh       # GCP: gcloud compute scp ... --zone
ssh admin@<ip> 'REPO_URL=git@github.com:<you>/CareerReboot.git bash ~/setup.sh'
```

The script installs Node 22, Playwright's Chromium and its system libraries, all npm
dependencies (career-ops, Hiring Radar, web), adds 2 GB swap on boxes with less
than 3 GB of RAM, builds `web/`, and starts it as the `career-ops-web` service.
`INSTALL_RTK=1` also installs [rtk](https://github.com/rtk-ai/rtk), only useful
if an AI CLI will run on the box.

## 4. Supply config and secrets

Personal config and secrets never travel through git or an image. Copy them
from your laptop and lock them down:

```bash
H=admin@<ip>   # or use `gcloud compute scp ... career-reboot:` with --zone
scp agents/career-ops/.env                  $H:~/CareerReboot/agents/career-ops/.env
scp agents/hiring-radar/.env                $H:~/CareerReboot/agents/hiring-radar/.env
scp agents/hiring-radar/config.yml          $H:~/CareerReboot/agents/hiring-radar/config.yml
scp agents/career-ops/config/profile.yml    $H:~/CareerReboot/agents/career-ops/config/profile.yml
scp agents/career-ops/portals.yml           $H:~/CareerReboot/agents/career-ops/portals.yml
scp agents/career-ops/cv.md                 $H:~/CareerReboot/agents/career-ops/cv.md
ssh $H 'chmod 600 ~/CareerReboot/agents/*/.env && sudo systemctl restart career-ops-web'
```

Copy only the files you use. Dashboard-only settings live in
`/etc/careerreboot/web.env` (see `web.env.example`). Rotate any key that was
ever on a VM you delete.

## 5. Schedule the jobs

`crontab -e` and paste from [crontab.example](crontab.example). Scans and the
daily Hiring Radar run on a timer; tailoring a CV or cover letter (paid API) is
deliberately never scheduled.

## 6. Open the dashboard

It has **no sign-in** and holds your CV, PII and routes that spend API credit,
so it is bound to `127.0.0.1` and never published. Two private ways in:

- **SSH tunnel** (no setup): `ssh -L 3000:localhost:3000 admin@<ip>` (GCP:
  `gcloud compute ssh career-reboot --zone=us-central1-a -- -L 3000:localhost:3000`),
  then browse to `http://localhost:3000`.
- **Tailscale** (always on, free for personal use): install it on the VM and
  your devices, run `sudo tailscale serve --bg 3000`, set
  `CAREER_OPS_WEB_ALLOWED_HOSTS=<machine>.<tailnet>.ts.net` in
  `/etc/careerreboot/web.env`, restart the service, and open
  `https://<machine>.<tailnet>.ts.net`. Never use `tailscale funnel`, which
  makes it public.

Do not open port 3000 in a firewall. Add real authentication before anyone
else uses the instance; to share the tool, give them the repo to run their own.

## 7. Verify

```bash
cd ~/CareerReboot/agents/career-ops
node doctor.mjs --json                      # onboarding files present
sudo systemctl status career-ops-web        # dashboard running
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200
crontab -l && tail -f ~/career-ops.log      # after the first scheduled run
```

## Deploying a newer commit

Merge to `main` (CI green), then on the VM: `bash ~/CareerReboot/deploy/vm/setup.sh`.
It pulls, reinstalls, rebuilds and restarts; your config files and
`/etc/careerreboot/web.env` are untouched. To roll back, `git -C ~/CareerReboot
checkout <good-commit>` and rebuild with `cd ~/CareerReboot/agents/career-ops/web && npm ci && npm run build && sudo systemctl restart career-ops-web`.

## Backups, pausing and teardown

- **Backups:** your data is files under `agents/career-ops/` (tracker, reports,
  `data/`, `output/`). Take a weekly snapshot (Lightsail automatic snapshots,
  $0.05/GB-month; GCP snapshot schedule) or `rsync` those folders to your laptop.
- **Pause:** on GCP, `gcloud compute instances stop` stops compute billing
  (disk and a reserved IP still bill). Lightsail bills a stopped instance at
  the full plan price; only deleting it stops the bill. Cron and the dashboard
  do not run while stopped.
- **Teardown:** snapshot or copy your data first, then delete the instance
  (and any static IP or snapshots) so nothing keeps billing.
