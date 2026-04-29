// ./front/public/components/contents/business-logs/business-logs.content.js
const state = {
  event: "",
  level: "",
  entityType: "",
  userId: "",
  take: "100",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function levelClasses(level) {
  const normalized = String(level || "").toUpperCase();
  if (normalized === "ERROR") return "border-red-200 bg-red-50 text-red-800";
  if (normalized === "WARNING") return "border-amber-200 bg-amber-50 text-amber-800";
  if (normalized === "VERBOSE") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function userName(user) {
  if (!user) return "Système";
  return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.o365Email || user.edEmail || `Utilisateur #${user.id}`;
}

function optionHtml(value, label, selectedValue) {
  const selected = String(value) === String(selectedValue) ? "selected" : "";
  return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
}

function fillSelect(id, options, currentValue, firstLabel = "Tous") {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = [
    optionHtml("", firstLabel, currentValue),
    ...options.map(option => optionHtml(option, option, currentValue)),
  ].join("");
}

function readFilters() {
  state.event = document.getElementById("business-logs-event")?.value || "";
  state.level = document.getElementById("business-logs-level")?.value || "";
  state.entityType = document.getElementById("business-logs-entity-type")?.value || "";
  state.userId = document.getElementById("business-logs-user-id")?.value || "";
  state.take = document.getElementById("business-logs-take")?.value || "100";
}

function buildQuery() {
  const params = new URLSearchParams({ take: state.take });
  if (state.event) params.set("event", state.event);
  if (state.level) params.set("level", state.level);
  if (state.entityType) params.set("entityType", state.entityType);
  if (state.userId) params.set("userId", state.userId);
  return params.toString();
}

function renderMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || !Object.keys(metadata).length) {
    return "";
  }

  return `
    <details class="mt-3 border border-neutral-200 bg-neutral-50 p-3">
      <summary class="cursor-pointer text-xs font-semibold uppercase text-neutral-500">Métadonnées</summary>
      <pre class="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-700">${escapeHtml(JSON.stringify(metadata, null, 2))}</pre>
    </details>
  `;
}

function renderLogs(logs) {
  const target = document.getElementById("business-logs-list");
  const summary = document.getElementById("business-logs-summary");
  if (!target) return;

  if (summary) {
    summary.innerText = `${logs.length} événement(s) affiché(s)`;
  }

  if (!logs.length) {
    target.innerHTML = `
      <div class="border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500 shadow-sm">
        Aucun log métier ne correspond aux filtres.
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="grid gap-3">
      ${logs.map(log => `
        <article class="border border-neutral-200 bg-white p-4 shadow-sm">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex border px-2 py-1 text-xs font-semibold ${levelClasses(log.level)}">${escapeHtml(log.level || "INFO")}</span>
                <span class="break-all font-mono text-xs text-[#624292]">${escapeHtml(log.event)}</span>
              </div>
              <p class="mt-2 break-words text-base font-semibold text-neutral-950">${escapeHtml(log.message)}</p>
              <p class="mt-1 text-sm text-neutral-500">${escapeHtml(userName(log.user))}${log.userId ? ` · #${escapeHtml(log.userId)}` : ""}</p>
            </div>
            <div class="shrink-0 text-left text-sm text-neutral-500 lg:text-right">
              <p>${escapeHtml(formatDateTime(log.createdAt))}</p>
              <p class="mt-1 break-all text-xs">${escapeHtml(log.ipAddress || "")}</p>
            </div>
          </div>

          <div class="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-3">
            <div class="border border-neutral-100 bg-neutral-50 p-2">
              <span class="font-semibold uppercase">Entité</span>
              <p class="mt-1 break-words text-neutral-800">${escapeHtml(log.entityType || "Non renseignée")}</p>
            </div>
            <div class="border border-neutral-100 bg-neutral-50 p-2">
              <span class="font-semibold uppercase">ID entité</span>
              <p class="mt-1 break-words text-neutral-800">${escapeHtml(log.entityId || "Non renseigné")}</p>
            </div>
            <div class="border border-neutral-100 bg-neutral-50 p-2">
              <span class="font-semibold uppercase">Navigateur</span>
              <p class="mt-1 line-clamp-2 break-words text-neutral-800">${escapeHtml(log.userAgent || "Non renseigné")}</p>
            </div>
          </div>
          ${renderMetadata(log.metadata)}
        </article>
      `).join("")}
    </div>
  `;
}

function renderError(message) {
  const error = document.getElementById("business-logs-error");
  if (!error) return;

  error.innerText = message || "";
  error.classList.toggle("hidden", !message);
}

async function loadLogs() {
  renderError("");
  const target = document.getElementById("business-logs-list");
  if (target) {
    target.innerHTML = `
      <div class="border border-neutral-200 bg-white p-6 text-sm text-neutral-500 shadow-sm">
        Chargement des logs métier...
      </div>
    `;
  }

  const response = await fetch(`/api/business-logs?${buildQuery()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Chargement impossible.");
  }

  fillSelect("business-logs-event", data.options?.events || [], state.event);
  fillSelect("business-logs-level", data.options?.levels || [], state.level);
  fillSelect("business-logs-entity-type", data.options?.entityTypes || [], state.entityType);
  renderLogs(data.logs || []);
}

function bindEvents() {
  document.getElementById("business-logs-filters")?.addEventListener("submit", async event => {
    event.preventDefault();
    readFilters();
    await loadLogs().catch(error => renderError(error.message));
  });

  document.getElementById("business-logs-clear")?.addEventListener("click", async () => {
    state.event = "";
    state.level = "";
    state.entityType = "";
    state.userId = "";
    state.take = "100";
    const userInput = document.getElementById("business-logs-user-id");
    const takeSelect = document.getElementById("business-logs-take");
    if (userInput) userInput.value = "";
    if (takeSelect) takeSelect.value = "100";
    await loadLogs().catch(error => renderError(error.message));
  });

  document.getElementById("business-logs-refresh")?.addEventListener("click", async () => {
    readFilters();
    await loadLogs().catch(error => renderError(error.message));
  });
}

export async function init() {
  if (!["staff", "admin"].includes(window.SACApp?.user?.role)) {
    await window.SACComponents.loadContent("home", "#content-slot", {
      app: window.SACApp,
    });
    return;
  }

  bindEvents();
  await loadLogs().catch(error => renderError(error.message));
}
