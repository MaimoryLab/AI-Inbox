const DEFAULT_API_BASE = "http://127.0.0.1:3111";
const input = document.getElementById("apiBase");
const saveButton = document.getElementById("save");
const status = document.getElementById("status");

chrome.storage.local.get(["apiBase"]).then(({ apiBase }) => {
  input.value = apiBase || DEFAULT_API_BASE;
});

saveButton.addEventListener("click", async () => {
  const value = input.value.trim() || DEFAULT_API_BASE;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid_protocol");
    await chrome.storage.local.set({ apiBase: url.toString().replace(/\/+$/, "") });
    status.textContent = "Saved";
  } catch {
    status.textContent = "Enter a valid HTTP URL";
  }
});
