const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  $("status").textContent = text;
  $("status").className = isError ? "error" : "";
}

async function readPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractors.js", "content.js"] });
    $("jd").value = result.text;
    $("company").value = result.company;
    $("source").textContent = result.text ? `(from ${result.source})` : "";
  } catch {
    $("source").textContent = "(this page can't be read; paste the description)";
  }
}

async function loadVariants(base) {
  const res = await fetch(`${base}/api/resume/variants`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  const { variants, default: preferred } = await res.json();
  const { lastVariant } = await chrome.storage.sync.get("lastVariant");
  $("variant").replaceChildren(...variants.map((v) => new Option(v, v)));
  $("variant").value = variants.includes(lastVariant) ? lastVariant : preferred;
  if (variants.length === 0) setStatus("No base variants found. Add .tex files to resume-variants/.", true);
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/** The server names the file; this is only the fallback when the header is unreadable. */
function fileName(res) {
  const fromHeader = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1];
  const company = ($("company").value.match(/[A-Za-z0-9]+/g) || []).join("_");
  return fromHeader || `Resume_${company || stamp()}.pdf`;
}

function summary(report) {
  const lines = ["Downloaded."];
  if (report.gaps?.length) lines.push(`Left out (do not claim): ${report.gaps.join(", ")}`);
  if (report.missing_keywords?.length) lines.push(`Not in your profile: ${report.missing_keywords.slice(0, 8).join(", ")}`);
  for (const w of report.warnings || []) lines.push(`Note: ${w}`);
  return lines.join("\n");
}

async function generate() {
  const jd = $("jd").value.trim();
  if (!jd) return setStatus("Add the job description first.", true);
  $("generate").disabled = true;
  setStatus("Tailoring with Claude and compiling. This can take a minute or two.");
  try {
    const base = await backendUrl();
    await chrome.storage.sync.set({ lastVariant: $("variant").value });
    const res = await fetch(`${base}/api/resume/tailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jd_text: jd, base_variant: $("variant").value, company_name: $("company").value.trim() || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const gaps = body.report?.gaps?.length ? `\nGaps: ${body.report.gaps.join(", ")}` : "";
      return setStatus(`${body.error || `HTTP ${res.status}`}${gaps}`, true);
    }
    const url = URL.createObjectURL(await res.blob());
    await chrome.downloads.download({ url, filename: fileName(res) });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    let report = {};
    try {
      report = JSON.parse(atob(res.headers.get("X-Tailor-Report") || "") || "{}");
    } catch {
      /* the PDF is what matters; the summary is optional */
    }
    setStatus(summary(report));
  } catch (e) {
    setStatus(`Could not reach CareerReboot: ${e.message}. Is the dev server running, and is this extension's origin allowed? See the extension README.`, true);
  } finally {
    $("generate").disabled = false;
  }
}

$("generate").addEventListener("click", generate);
readPage();
backendUrl()
  .then(loadVariants)
  .catch((e) => setStatus(`Could not load base variants: ${e.message}`, true));
