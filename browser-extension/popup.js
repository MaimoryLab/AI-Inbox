const syncButton = document.getElementById("sync");
const apiBase = document.getElementById("apiBase");
const status = document.getElementById("status");
const turns = document.getElementById("turns");
const syncedAt = document.getElementById("syncedAt");

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  status.textContent = "Syncing";
  try {
    render(await chrome.runtime.sendMessage({ type: "AI_INDEX_SYNC_ACTIVE_TAB" }));
  } finally {
    syncButton.disabled = false;
  }
});

chrome.runtime.sendMessage({ type: "AI_INDEX_STATUS" }).then(renderStatus).catch((error) => {
  status.textContent = error?.message || "Unavailable";
});

function renderStatus(next) {
  apiBase.textContent = next?.apiBase || "-";
  render(next?.lastResult || null);
}

function render(result) {
  if (!result) {
    status.textContent = "No sync yet";
    turns.textContent = "-";
    syncedAt.textContent = "-";
    return;
  }
  status.textContent = result.ok ? (result.skipped ? "Unchanged" : "Synced") : result.error || "Failed";
  turns.textContent = String(result.turnCount ?? result.observations ?? "-");
  syncedAt.textContent = result.syncedAt ? new Date(result.syncedAt).toLocaleString() : "-";
}
