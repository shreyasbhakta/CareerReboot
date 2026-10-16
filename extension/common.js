// Shared by the popup and the options page.
const DEFAULT_BACKEND = "http://localhost:3111";

async function backendUrl() {
  const { backend } = await chrome.storage.sync.get({ backend: DEFAULT_BACKEND });
  return backend.replace(/\/+$/, "");
}
