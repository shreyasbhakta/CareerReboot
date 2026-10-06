# CareerReboot stable runtime: the dashboard and scheduled scans, built from one release tag.
# Build with deploy/docker/stable.sh, which feeds this a `git archive` of the tag as the context.
# Personal files are not in the image; the entrypoint links them from the host checkout.

# Chromium for PDF rendering ships in this image (matches playwright 1.62.1 used by career-ops).
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# cron runs the scheduled scans; texlive builds the LaTeX CV.
RUN apt-get update \
 && apt-get install -y --no-install-recommends cron tzdata latexmk texlive-latex-recommended texlive-latex-extra texlive-fonts-recommended texlive-xetex \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm --prefix agents/career-ops install --ignore-scripts --no-audit --no-fund \
 && npm --prefix agents/hiring-radar ci --no-audit --no-fund \
 && npm --prefix agents/career-ops/web ci --no-audit --no-fund \
 && npm --prefix agents/career-ops/web run build

EXPOSE 3000
ENTRYPOINT ["/app/deploy/docker/entrypoint.sh"]
