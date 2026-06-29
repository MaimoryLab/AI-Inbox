const state = {
  sources: [],
  sessions: [],
  todos: [],
  settings: null,
  settingsOpen: false
};

const $ = (selector) => document.querySelector(selector);

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

$("#scan-codex").addEventListener("click", () => scan("codex"));
$("#scan-claude").addEventListener("click", () => scan("claude-code"));
$("#organize").addEventListener("click", organize);
$("#settings-gear").addEventListener("click", toggleSettings);
$("#settings-panel").addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action === "close-settings") closeSettings();
});
$("#settings-panel").addEventListener("submit", saveSettings);

await refresh();

async function refresh() {
  try {
    const [sources, sessions, todos, settings] = await Promise.all([
      api("/sources"),
      api("/sessions"),
      api("/todos"),
      api("/settings")
    ]);
    Object.assign(state, { sources, sessions, todos, settings });
    render();
    setStatus("Ready");
  } catch (error) {
    setStatus(error.message);
  }
}

function render() {
  renderSources();
  renderSessions();
  renderTodos();
  renderSettingsPanel();
}

function renderSources() {
  $("#source-grid").innerHTML = state.sources.map((source) => `
    <article class="stat">
      <div class="label">${escapeHtml(source.source)}</div>
      <div class="value">${source.sessions}</div>
      <div class="meta">${source.checkpoints} checkpoints</div>
    </article>
  `).join("");
}

function renderSessions() {
  $("#sessions").innerHTML = state.sessions.length ? state.sessions.map((session) => `
    <article class="row">
      <div class="row-head">
        <div class="title">${escapeHtml(session.source)}</div>
        <div class="meta">${formatDate(session.updatedAt)}</div>
      </div>
      <div class="meta">${escapeHtml(session.path)}</div>
    </article>
  `).join("") : `<div class="empty">No sessions scanned yet.</div>`;
}

function renderTodos() {
  $("#todo-list").innerHTML = state.todos.length ? state.todos.map((todo) => `
    <article class="row todo-card">
      <div class="priority-rail ${escapeHtml(todo.status)}"></div>
      <div class="todo-main">
        <div class="todo-title">${escapeHtml(todo.title)}</div>
        <div class="todo-desc">${escapeHtml(todo.description)}</div>
        <div class="todo-meta">
          <span class="badge ${todo.status}">${todo.status}</span>
          <span class="badge">${todo.evidenceIds.length} evidence</span>
          <span class="meta">${formatDate(todo.updatedAt)}</span>
        </div>
      </div>
      <div class="todo-actions">
        <button class="evidence-link" type="button" data-evidence="${escapeHtml(todo.id)}">Evidence</button>
        <span class="action-secondary">
          <button class="btn-primary-sm" type="button" data-status="done" data-id="${escapeHtml(todo.id)}">Done</button>
          <button class="btn-ghost-sm" type="button" data-status="ignored" data-id="${escapeHtml(todo.id)}">Ignore</button>
        </span>
      </div>
    </article>
  `).join("") : `<div class="empty">No todos. Scan sources, then organize.</div>`;

  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", () => updateTodo(button.dataset.id, button.dataset.status));
  });
  document.querySelectorAll("[data-evidence]").forEach((button) => {
    button.addEventListener("click", () => jumpToTodoEvidence(button.dataset.evidence));
  });
}

function renderSettingsPanel() {
  const settings = state.settings;
  const llm = settings?.llm ?? {};
  const organize = settings?.organize ?? {};
  const apiKeyLabel = llm.apiKeyConfigured ? `Configured ${llm.apiKeyMasked}` : "Missing";
  $("#settings-panel").classList.toggle("open", state.settingsOpen);
  $("#settings-panel").setAttribute("aria-hidden", String(!state.settingsOpen));
  $("#settings-gear").setAttribute("aria-expanded", String(state.settingsOpen));
  $("#settings-panel").innerHTML = `
    <div class="settings-head">
      <div>
        <div class="settings-title">Settings</div>
        <div class="settings-sub">Local paths and LLM extraction defaults.</div>
      </div>
      <button class="ghost" type="button" data-action="close-settings" aria-label="Close settings">Close</button>
    </div>
    <form id="settings-form" class="settings-form">
      <section class="settings-section">
        <div class="settings-section-title">Sources</div>
        <div class="settings-grid">
          <label>
            Codex source path
            <input id="codex-path" name="codex" autocomplete="off" value="${escapeAttr(settings?.sources?.codex?.path ?? "")}">
          </label>
          <label>
            Claude Code source path
            <input id="claude-path" name="claude" autocomplete="off" value="${escapeAttr(settings?.sources?.["claude-code"]?.path ?? "")}">
          </label>
        </div>
      </section>
      <section class="settings-section">
        <div class="settings-section-title">LLM Extraction</div>
        <div class="settings-grid">
          <label class="check-row">
            <input id="llm-enabled" type="checkbox" ${llm.enabled === false ? "" : "checked"}>
            Enable LLM card generation
          </label>
          <label>
            Provider
            <select id="llm-provider">
              <option value="openai" selected>openai</option>
            </select>
          </label>
          <label>
            Model
            <input id="llm-model" autocomplete="off" value="${escapeAttr(llm.model ?? "deepseek/deepseek-v4-flash")}">
          </label>
          <label>
            Endpoint
            <input id="llm-endpoint" autocomplete="off" value="${escapeAttr(llm.endpoint ?? "https://api.novita.ai/openai/v1")}">
          </label>
          <label>
            Thinking depth
            <select id="llm-thinking">
              ${["low", "medium", "high"].map((depth) => `<option value="${depth}" ${depth === (llm.thinkingDepth ?? "medium") ? "selected" : ""}>${depth}</option>`).join("")}
            </select>
          </label>
          <label>
            Python path
            <input id="llm-python" autocomplete="off" value="${escapeAttr(llm.pythonPath ?? "python3")}">
          </label>
          <label>
            Timeout ms
            <input id="llm-timeout" type="number" min="1000" max="600000" step="1000" value="${escapeAttr(llm.timeoutMs ?? 120000)}">
          </label>
          <label>
            API key
            <input id="llm-api-key" type="password" autocomplete="off" placeholder="Leave blank to keep current key">
          </label>
          <label class="check-row">
            <input id="llm-clear-key" type="checkbox">
            Clear saved API key
          </label>
          <div class="settings-note">API key: ${escapeHtml(apiKeyLabel)}</div>
        </div>
      </section>
      <section class="settings-section">
        <div class="settings-section-title">Organize Scope</div>
        <div class="settings-grid">
          <label>
            Look-back days
            <input id="organize-since-days" type="number" min="1" max="3650" step="1" value="${escapeAttr(organize.sinceDays ?? 7)}">
          </label>
          <label>
            Max interactions per session
            <input id="organize-max-interactions" type="number" min="1" max="500" step="1" value="${escapeAttr(organize.maxInteractionsPerSession ?? 10)}">
          </label>
        </div>
      </section>
      <button type="submit" class="primary">Save Settings</button>
    </form>
  `;
}

async function scan(source) {
  setStatus(`Scanning ${source}...`);
  await api("/sources/scan", { method: "POST", body: { source } });
  await refresh();
}

async function organize() {
  setStatus("Organizing todos...");
  const result = await api("/todos/organize", { method: "POST", body: {} });
  showOrganizeResult(result);
  await refresh();
}

async function updateTodo(id, status) {
  await api(`/todos/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
  await refresh();
}

async function jumpToTodoEvidence(id) {
  const evidence = await api(`/todos/${encodeURIComponent(id)}/evidence`);
  if (evidence.length === 0) {
    $("#evidence-list").innerHTML = `<div class="empty">No evidence for this todo.</div>`;
    showView("evidence");
    return;
  }

  const targetObservationId = evidence[0].observationId;
  const resolved = await resolveObservationSession(targetObservationId);
  if (!resolved) {
    renderEvidenceList(evidence, targetObservationId);
    showView("evidence");
    setStatus("Evidence loaded, but source session was not found.");
    return;
  }

  renderEvidenceSession(resolved.session, resolved.observations, targetObservationId);
  showView("evidence");
  requestAnimationFrame(() => applyObservationHighlight(targetObservationId));
}

async function resolveObservationSession(observationId) {
  for (const session of state.sessions) {
    const observations = await api(`/sessions/${encodeURIComponent(session.id)}/observations`);
    if (observations.some((observation) => observation.id === observationId)) {
      return { session, observations };
    }
  }
  return null;
}

function renderEvidenceList(evidence, targetObservationId) {
  $("#evidence-list").innerHTML = evidence.map((item) => `
    <article id="obs-anchor-${escapeAttr(item.observationId)}" class="row observation-card ${item.observationId === targetObservationId ? "obs-jump-highlight" : ""}">
      <div class="meta">${escapeHtml(item.observationId)}</div>
      <div class="desc">${escapeHtml(item.text)}</div>
    </article>
  `).join("");
}

function renderEvidenceSession(session, observations, targetObservationId) {
  $("#evidence-list").innerHTML = `
    <article class="row">
      <div class="row-head">
        <div class="title">${escapeHtml(session.source)}</div>
        <div class="meta">${formatDate(session.updatedAt)}</div>
      </div>
      <div class="meta">${escapeHtml(session.path)}</div>
    </article>
    ${observations.map((observation) => `
      <article id="obs-anchor-${escapeAttr(observation.id)}" class="row observation-card ${observation.id === targetObservationId ? "obs-jump-highlight" : ""}">
        <div class="row-head">
          <div class="title">${escapeHtml(observation.role)}</div>
          <div class="meta">${formatDate(observation.createdAt)}</div>
        </div>
        <div class="meta">${escapeHtml(observation.id)}</div>
        <div class="desc">${escapeHtml(observation.text)}</div>
      </article>
    `).join("")}
  `;
}

function applyObservationHighlight(observationId) {
  const element = document.getElementById(`obs-anchor-${observationId}`);
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.classList.remove("obs-jump-highlight");
  void element.offsetWidth;
  element.classList.add("obs-jump-highlight");
  setTimeout(() => element.classList.remove("obs-jump-highlight"), 2400);
}

async function saveSettings(event) {
  event.preventDefault();
  const apiKey = $("#llm-api-key").value.trim();
  const clearKey = $("#llm-clear-key").checked;
  const llm = {
    enabled: $("#llm-enabled").checked,
    provider: "openai",
    model: $("#llm-model").value.trim(),
    endpoint: $("#llm-endpoint").value.trim(),
    thinkingDepth: $("#llm-thinking").value,
    pythonPath: $("#llm-python").value.trim(),
    timeoutMs: Number($("#llm-timeout").value)
  };
  if (clearKey) llm.apiKey = "";
  if (!clearKey && apiKey) llm.apiKey = apiKey;

  await api("/settings", {
    method: "PUT",
    body: {
      sources: {
        codex: pathValue("#codex-path"),
        "claude-code": pathValue("#claude-path")
      },
      llm,
      organize: {
        sinceDays: Number($("#organize-since-days").value),
        maxInteractionsPerSession: Number($("#organize-max-interactions").value)
      }
    }
  });
  await refresh();
  state.settingsOpen = true;
  renderSettingsPanel();
}

function pathValue(selector) {
  const path = $(selector).value.trim();
  return path ? { path } : {};
}

function toggleSettings() {
  state.settingsOpen = !state.settingsOpen;
  renderSettingsPanel();
}

function closeSettings() {
  state.settingsOpen = false;
  renderSettingsPanel();
}

function showOrganizeResult(result) {
  $("#organize-result").innerHTML = [
    ["Scanned", result.scanned],
    ["Created", result.created],
    ["Updated", result.updated],
    ["Completed", result.completed],
    ["Ignored", result.ignored],
    ["Engine", result.engine],
    ["Warnings", result.warnings.join(", ") || "none"],
    ["Duration", `${result.durationMs}ms`]
  ].map(([label, value]) => `
    <div class="stat">
      <div class="label">${label}</div>
      <div class="value">${escapeHtml(String(value))}</div>
    </div>
  `).join("");
  $("#organize-dialog").showModal();
}

function showView(id) {
  document.querySelectorAll(".tabs button").forEach((button) => {
    const active = button.dataset.view === id;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === id);
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function setStatus(message) {
  $("#status").textContent = message;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
