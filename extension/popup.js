const $ = (id) => document.getElementById(id);

function showJob(job) {
  if (!job) return;
  $("status").textContent = job.message;
  $("status").className = job.state === "error" ? "error" : "";
  // A worker killed mid-request leaves "running" behind; after 10 minutes it is stale.
  $("generate").disabled = job.state === "running" && Date.now() - job.at < 600_000;
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
  if (variants.length === 0) showJob({ state: "error", message: "No base variants found. Add .tex files to resume-variants/." });
}

async function generate() {
  const jd = $("jd").value.trim();
  if (!jd) return showJob({ state: "error", message: "Add the job description first." });
  await chrome.storage.sync.set({ lastVariant: $("variant").value });
  // The background worker owns the request, so it survives this popup closing.
  chrome.runtime.sendMessage({ type: "generate", jd, variant: $("variant").value, company: $("company").value.trim() });
}

$("generate").addEventListener("click", generate);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.job) showJob(changes.job.newValue);
});
chrome.storage.local.get("job").then(({ job }) => showJob(job));
readPage();
backendUrl()
  .then(loadVariants)
  .catch((e) => showJob({ state: "error", message: `Could not load base variants: ${e.message}` }));
