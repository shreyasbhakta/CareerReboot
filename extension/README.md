# CareerReboot Resume Tailor (Chrome extension)

Reads the job description on the page you're viewing, sends it to your local CareerReboot
dashboard, and downloads a tailored one-page PDF resume. Nothing runs until you click
**Generate**, and nothing is sent anywhere except your own `localhost` backend.

## What it does

- Opening the popup reads the job description from the page. It uses specific selectors for
  LinkedIn, Greenhouse, Lever, Workday and Ashby. If none match, it uses your text selection,
  and if there's no selection, the largest block of text on the page. It only reads the page
  you already have open: it never navigates, clicks, logs in or fetches anything.
- You can fix the text, the company and the base variant before you generate.
- **Generate** calls `POST /api/resume/tailor` from the extension's background worker, so you can
  close the popup or switch tabs while it runs. The PDF saves to `Downloads/CareerReboot/<Your_Name>_<Company>.pdf`;
  reopen the popup to see the status, including what was left out because it's on your "Do not claim" list.
  Every run is also kept on the backend under `agents/career-ops/output/resume-tailor/`.

## Load it unpacked

1. Get the folder: use `extension/` in this repo, or click **Download extension** on the
   dashboard's Config page and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the
   folder.
3. Copy the extension's **ID** from its card.
4. Allow that origin in the dashboard's env file (`agents/career-ops/web/.env.local`), then
   restart the dev server:

   ```bash
   CAREER_OPS_ALLOWED_ORIGINS=chrome-extension://<the-id>
   ```

   The dashboard refuses every cross-origin API call unless its origin is listed here.

## Set the backend URL

The default is `http://localhost:3111`, the dev server. Claude actions only run there, not in
the Docker build. To change it, click **Backend URL** in the popup (or open the extension's
**Details → Extension options**). Only `localhost` and `127.0.0.1` are accepted, because the
manifest grants no other host.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3: `activeTab`, `scripting`, `storage`, `downloads`, localhost only |
| `extractors.js` | Per-site selectors (data). Add a site by adding an entry |
| `content.js` | Injected on open: selectors, then selection, then largest text block |
| `popup.*` | The popup UI |
| `background.js` | Runs the request and the download, so they survive the popup closing |
| `options.*`, `common.js` | Backend URL setting |
