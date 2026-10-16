// Runs the tailor request outside the popup, so closing it or switching tabs doesn't cancel it.
// The popup reads progress from chrome.storage.local ("job").
importScripts("common.js");

const setJob = (job) => chrome.storage.local.set({ job: { ...job, at: Date.now() } });

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** Blob -> data: URL, since a service worker has no URL.createObjectURL. */
async function dataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:application/pdf;base64,${btoa(bin)}`;
}

async function generate({ jd, variant, company }) {
  await setJob({ state: "running", message: "Tailoring with Claude and compiling. You can switch tabs; the PDF saves to Downloads/CareerReboot." });
  // An extension API call every 20s keeps the worker alive while the request is pending.
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20_000);
  try {
    const res = await fetch(`${await backendUrl()}/api/resume/tailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd_text: jd, base_variant: variant, company_name: company || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const gaps = body.report?.gaps?.length ? `\nGaps: ${body.report.gaps.join(", ")}` : "";
      return setJob({ state: "error", message: `${body.error || `HTTP ${res.status}`}${gaps}` });
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `Resume_${(company.match(/[A-Za-z0-9]+/g) || []).join("_") || stamp()}.pdf`;
    await chrome.downloads.download({ url: await dataUrl(await res.blob()), filename: `CareerReboot/${name}` });
    let report = {};
    try {
      report = JSON.parse(atob(res.headers.get("X-Tailor-Report") || "") || "{}");
    } catch {
      /* the PDF is what matters; the summary is optional */
    }
    const lines = [`Saved to Downloads/CareerReboot/${name}`];
    if (report.gaps?.length) lines.push(`Left out (do not claim): ${report.gaps.join(", ")}`);
    if (report.missing_keywords?.length) lines.push(`Not in your profile: ${report.missing_keywords.slice(0, 8).join(", ")}`);
    for (const w of report.warnings || []) lines.push(`Note: ${w}`);
    await setJob({ state: "done", message: lines.join("\n") });
  } catch (e) {
    await setJob({ state: "error", message: `Could not reach CareerReboot: ${e.message}. Is the dev server running, and is this extension's origin allowed? See the extension README.` });
  } finally {
    clearInterval(keepAlive);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "generate") generate(msg);
});
