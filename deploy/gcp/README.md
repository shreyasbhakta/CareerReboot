# Deploying to GCP

A single always-on Compute Engine VM: `cron` for the scan/tracker jobs, plus
a `systemd` service running the `web/` dashboard. No GPU, no local LLM — the
agents call out to hosted models (free-tier Gemini/OpenRouter for scanning,
Claude API for tailoring).

## 0. Prerequisites (your own account, not anyone else's)

Nothing below references a specific GCP project, billing account, or
credentials — every command operates on whatever project is currently active
in your own `gcloud` config. To point it at your account:

```bash
brew install --cask google-cloud-sdk   # or https://cloud.google.com/sdk/docs/install
gcloud auth login                      # your Google account, opens a browser
gcloud projects create YOUR-PROJECT-ID # or reuse an existing project
gcloud config set project YOUR-PROJECT-ID
gcloud billing projects link YOUR-PROJECT-ID --billing-account=YOUR-BILLING-ACCOUNT-ID
gcloud services enable compute.googleapis.com
```

Everything from here runs against `YOUR-PROJECT-ID` and bills your account —
this repo has no embedded credentials or project references anywhere.

## 1. Create the VM

```bash
gcloud compute instances create career-reboot \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB
```

`e2-medium` (4GB RAM, 2 vCPU) — bumped up from the original `e2-small` plan
now that the box runs a persistent Next.js server *and* periodic Playwright
Chromium scans concurrently; 2GB was comfortable for cron alone but risks the
web app and a scan competing for memory at the same time. No firewall rules
needed: the web app binds to `127.0.0.1` only (see step 5) — there is no
public inbound surface to open, and none should be.

## 2. SSH in and bootstrap

```bash
gcloud compute ssh career-reboot --zone=us-central1-a
```

Then, on the VM:

```bash
curl -fsSL https://raw.githubusercontent.com/<you>/CareerReboot/main/deploy/gcp/setup.sh -o setup.sh
# or: scp it up directly if the repo isn't pushed yet (see step 3)
bash setup.sh
```

`setup.sh` installs Node 22 (career-ops core needs >=18, `web/` needs >=22),
git, Playwright's system deps, `rtk`, clones the repo, runs `npm install` in
`agents/career-ops` (triggers Playwright's Chromium download), builds
`web/`, and installs+starts it as a `systemd` service bound to localhost.

## 3. Get the repo and secrets onto the VM

If `CareerReboot` is on GitHub already:

```bash
git clone https://github.com/<you>/CareerReboot.git
```

Either way, `.env` is gitignored and never travels through git. Copy it up
directly from your laptop instead:

```bash
gcloud compute scp .env career-reboot:~/CareerReboot/agents/career-ops/.env --zone=us-central1-a
gcloud compute scp agents/career-ops/config/profile.yml career-reboot:~/CareerReboot/agents/career-ops/config/profile.yml --zone=us-central1-a
gcloud compute scp agents/career-ops/portals.yml career-reboot:~/CareerReboot/agents/career-ops/portals.yml --zone=us-central1-a
gcloud compute scp agents/career-ops/cv.md career-reboot:~/CareerReboot/agents/career-ops/cv.md --zone=us-central1-a
```

After copying `.env`/config over, restart the web service so it picks them up:

```bash
sudo systemctl restart career-ops-web
```

(Repo visibility doesn't actually matter for PII — career-ops' own
`.gitignore` already excludes `cv.md`, `config/profile.yml`, `portals.yml`,
and everything under `data/`/`output`/`reports`/`interview-prep`. A private
repo is still the safer default; this is belt-and-suspenders.)

## 4. Wire up cron

```bash
crontab -e
```

Paste from [crontab.example](crontab.example), adjusting the repo path and
cadence. Scanning/matching (free-tier model) can run often; tailoring a CV
+ cover letter (Claude API, costs money) should stay something you trigger
per-role, not blast on every cron tick.

## 5. Accessing the web app

The dashboard has **no built-in login** — by design, it was built as a local,
single-user tool (see `agents/career-ops/web/README.md`: "local-first ...
no cloud, no account needed"). It also holds your resume/PII and exposes
routes that trigger paid API calls. So it is bound to `127.0.0.1` on the VM
on purpose, and reached only through a tunnel you control — never opened to
the public internet:

```bash
gcloud compute ssh career-reboot --zone=us-central1-a -- -L 3000:localhost:3000
```

Leave that SSH session open and browse to `http://localhost:3000` on your
laptop — it's tunneling straight to the VM's local port, so nothing new is
exposed. If you want always-on access without re-running the tunnel command
each time, install [Tailscale](https://tailscale.com/) on the VM and your
laptop instead (`curl -fsSL https://tailscale.com/install.sh | sh`) and hit
the VM's Tailscale IP directly on port 3000 — still private to devices on
your tailnet, still no public exposure.

**If you later want to actually share this with someone else** ("send them
the dockerized one," per the original plan): give them the repo + a Docker
image and let them run their own instance with their own `cv.md`/`.env` —
don't put your own data behind a public URL for them to use instead.

## 6. Verify

```bash
cd ~/CareerReboot/agents/career-ops
node doctor.mjs --json
sudo systemctl status career-ops-web
```

`doctor.mjs` should report no missing onboarding files once `cv.md`/
`config/profile.yml` are in place. Check `crontab -l` and `/var/log/syslog`
(or `grep CRON /var/log/syslog`) after the first scheduled run to confirm
cron actually fired.

## Cost

`e2-medium` runs roughly $25-28/mo on-demand in `us-central1` (less with a
committed-use discount, more in other regions) — still negligible next to
model API spend for a 1.5-week sprint. Stop the instance
(`gcloud compute instances stop`) between active search phases if you want
to cut that further; cron and the web app just won't run while it's stopped.
