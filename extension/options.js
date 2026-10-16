const input = document.getElementById("backend");
const status = document.getElementById("status");

backendUrl().then((url) => (input.value = url));

document.getElementById("save").addEventListener("click", async () => {
  let url;
  try {
    url = new URL(input.value.trim());
  } catch {
    url = null;
  }
  // The manifest only grants localhost, so any other host would fail at fetch time.
  if (!url || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    status.textContent = "Use http://localhost:<port> or http://127.0.0.1:<port>.";
    status.className = "error";
    return;
  }
  await chrome.storage.sync.set({ backend: url.origin });
  status.textContent = `Saved: ${url.origin}`;
  status.className = "";
});
