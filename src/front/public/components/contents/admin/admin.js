const state = {
  activeTab: "users",
  users: [],
  sessions: [],
  options: {
    classes: [],
    rooms: [],
    teachers: [],
  },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "Non renseigné";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function roleLabel(role) {
  return {
    student: "Élève",
    teacher: "Enseignant",
    staff: "Personnel",
    admin: "Admin",
  }[role] || role || "Non renseigné";
}

function showAlert(message, type = "success") {
  const alert = document.getElementById("admin-alert");
  if (!alert) return;

  alert.className = `mt-5 border px-4 py-3 text-sm ${
    type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800"
  }`;
  alert.innerText = message;
}

function getCookie(name) {
  return document.cookie
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const csrfHeader = ["POST", "PATCH", "PUT", "DELETE"].includes(method)
    ? { "x-csrf-token": getCookie("XSRF-TOKEN") }
    : {};
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...csrfHeader,
      ...(options.headers || {}),
    },
    ...options,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Erreur API ${response.status}`);
  }

  return data;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll("[data-admin-tab]").forEach(button => {
    const active = button.dataset.adminTab === tab;
    button.classList.toggle("bg-[#624292]", active);
    button.classList.toggle("text-white", active);
    button.classList.toggle("bg-white", !active);
    button.classList.toggle("text-neutral-800", !active);
  });
  document.querySelectorAll("[data-admin-panel]").forEach(panel => {
    panel.classList.toggle("hidden", panel.dataset.adminPanel !== tab);
  });
}

function userRow(user) {
  return `
    <tr class="border-t border-neutral-200">
      <td class="px-2 py-2 text-sm">${escapeHtml(user.id)}</td>
      <td class="px-2 py-2 text-sm">${escapeHtml(`${user.lastName || ""} ${user.firstName || ""}`.trim() || "Sans nom")}</td>
      <td class="px-2 py-2 text-sm">${escapeHtml(user.o365Email || user.edEmail || "")}</td>
      <td class="px-2 py-2 text-sm">
        <select data-user-role="${escapeHtml(user.id)}" class="border border-neutral-300 bg-white px-2 py-1 text-sm">
          ${["student", "teacher", "staff", "admin"].map(role => `
            <option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(roleLabel(role))}</option>
          `).join("")}
        </select>
      </td>
      <td class="px-2 py-2 text-right">
        <button type="button" data-save-user-role="${escapeHtml(user.id)}" class="inline-flex items-center gap-2 border border-[#624292] bg-[#624292] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#52357f]">
          <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
          <span>Sauver</span>
        </button>
      </td>
    </tr>
  `;
}

function renderUsers() {
  const target = document.getElementById("admin-users-list");
  if (!target) return;

  if (!state.users.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucun utilisateur trouvé.</p>`;
    return;
  }

  target.innerHTML = `
    <table class="w-full min-w-[760px] text-left">
      <thead class="bg-neutral-100 text-xs uppercase text-neutral-500">
        <tr>
          <th class="px-2 py-2">ID</th>
          <th class="px-2 py-2">Nom</th>
          <th class="px-2 py-2">Mail</th>
          <th class="px-2 py-2">Rôle</th>
          <th class="px-2 py-2 text-right">Action</th>
        </tr>
      </thead>
      <tbody>${state.users.map(userRow).join("")}</tbody>
    </table>
  `;

  document.querySelectorAll("[data-save-user-role]").forEach(button => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.saveUserRole;
      const role = document.querySelector(`[data-user-role="${userId}"]`)?.value;
      try {
        await api(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        });
        showAlert("Rôle utilisateur mis à jour.");
        await loadUsers();
      } catch (error) {
        showAlert(error.message, "error");
      }
    });
  });
}

async function loadUsers() {
  const role = document.getElementById("admin-users-role")?.value || "";
  const query = role ? `?role=${encodeURIComponent(role)}` : "";
  state.users = await api(`/api/admin/users${query}`);
  renderUsers();
}

function optionHtml(value, label, selectedValue = "") {
  return `<option value="${escapeHtml(value)}" ${String(value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function fillOptions() {
  const classSelect = document.getElementById("admin-session-class");
  const roomSelect = document.getElementById("admin-session-room");
  const teacherSelect = document.getElementById("admin-session-teacher");
  if (classSelect) classSelect.innerHTML = state.options.classes.map(item => optionHtml(item.id, item.name || item.code)).join("");
  if (roomSelect) roomSelect.innerHTML = state.options.rooms.map(item => optionHtml(item.id, item.name || item.code)).join("");
  if (teacherSelect) {
    teacherSelect.innerHTML = state.options.teachers.map(item => {
      const name = `${item.lastName || ""} ${item.firstName || ""}`.trim() || `Enseignant #${item.id}`;
      return optionHtml(item.id, name);
    }).join("");
  }
}

function renderSessions() {
  const target = document.getElementById("admin-sessions-list");
  if (!target) return;

  if (!state.sessions.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucune session sur cette période.</p>`;
    return;
  }

  target.innerHTML = state.sessions.map(session => `
    <article class="border border-neutral-200 bg-neutral-50 p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <h4 class="break-words text-base font-semibold">${escapeHtml(session.label || session.matiere || "Cours")}</h4>
          <p class="mt-1 text-sm text-neutral-500">#${escapeHtml(session.id)} · ${formatDateTime(session.startTime)} - ${formatDateTime(session.endTime)}</p>
          <p class="mt-1 text-sm text-neutral-700">${escapeHtml(session.class?.name || session.class?.code || "Classe ?")} · ${escapeHtml(session.room?.name || session.room?.code || "Salle ?")} · ${escapeHtml(`${session.teacher?.lastName || ""} ${session.teacher?.firstName || ""}`.trim() || "Prof ?")}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-edit-session="${escapeHtml(session.id)}" class="inline-flex items-center gap-2 border border-neutral-300 bg-white px-3 py-2 text-sm font-medium transition hover:bg-neutral-50">
            <i class="fa-solid fa-pen" aria-hidden="true"></i><span>Modifier</span>
          </button>
          <button type="button" data-delete-session="${escapeHtml(session.id)}" class="inline-flex items-center gap-2 border border-red-700 bg-red-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-800">
            <i class="fa-solid fa-trash" aria-hidden="true"></i><span>Supprimer</span>
          </button>
        </div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-edit-session]").forEach(button => {
    button.addEventListener("click", () => editSession(button.dataset.editSession));
  });
  document.querySelectorAll("[data-delete-session]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!window.confirm("Supprimer cette session ?")) return;
      try {
        await api(`/api/admin/sessions/${encodeURIComponent(button.dataset.deleteSession)}`, { method: "DELETE" });
        showAlert("Session supprimée.");
        await loadSessions();
      } catch (error) {
        showAlert(error.message, "error");
      }
    });
  });
}

async function loadSessions() {
  const dateInput = document.getElementById("admin-sessions-date");
  const viewInput = document.getElementById("admin-sessions-view");
  const date = dateInput?.value || toIsoDate();
  const view = viewInput?.value || "month";
  if (dateInput) dateInput.value = date;

  const payload = await api(`/api/sessions/staff?date=${encodeURIComponent(date)}&view=${encodeURIComponent(view)}`);
  state.sessions = payload.sessions || [];
  state.options = payload.options || state.options;
  fillOptions();
  renderSessions();
}

function resetSessionForm() {
  document.getElementById("admin-session-form-title").innerText = "Créer une session";
  document.getElementById("admin-session-id").value = "";
  document.getElementById("admin-session-form").reset();
  fillOptions();
}

function editSession(sessionId) {
  const session = state.sessions.find(item => String(item.id) === String(sessionId));
  if (!session) return;

  document.getElementById("admin-session-form-title").innerText = `Modifier la session #${session.id}`;
  document.getElementById("admin-session-id").value = session.id;
  document.getElementById("admin-session-label").value = session.label || "";
  document.getElementById("admin-session-subject").value = session.matiere || "";
  document.getElementById("admin-session-class").value = session.class?.id || "";
  document.getElementById("admin-session-room").value = session.room?.id || "";
  document.getElementById("admin-session-teacher").value = session.teacher?.id || "";
  document.getElementById("admin-session-start").value = toDatetimeLocal(session.startTime);
  document.getElementById("admin-session-end").value = toDatetimeLocal(session.endTime);
  document.getElementById("admin-session-status").value = session.status || "scheduled";
}

function sessionFormData() {
  return {
    label: document.getElementById("admin-session-label").value || null,
    matiere: document.getElementById("admin-session-subject").value || null,
    classId: Number(document.getElementById("admin-session-class").value),
    roomId: Number(document.getElementById("admin-session-room").value),
    teacherId: Number(document.getElementById("admin-session-teacher").value),
    startTime: new Date(document.getElementById("admin-session-start").value).toISOString(),
    endTime: new Date(document.getElementById("admin-session-end").value).toISOString(),
    status: document.getElementById("admin-session-status").value,
  };
}

async function saveSession(event) {
  event.preventDefault();
  const sessionId = document.getElementById("admin-session-id").value;
  const method = sessionId ? "PATCH" : "POST";
  const path = sessionId ? `/api/admin/sessions/${encodeURIComponent(sessionId)}` : "/api/admin/sessions";

  try {
    await api(path, {
      method,
      body: JSON.stringify(sessionFormData()),
    });
    showAlert(sessionId ? "Session modifiée." : "Session créée.");
    resetSessionForm();
    await loadSessions();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function submitOverride(event) {
  event.preventDefault();
  try {
    await api("/api/admin/attendance/override", {
      method: "POST",
    body: JSON.stringify({
        sessionId: Number(document.getElementById("admin-override-session").value),
        studentId: Number(document.getElementById("admin-override-student").value),
        status: document.getElementById("admin-override-status").value,
      }),
    });
    showAlert("Présence corrigée.");
  } catch (error) {
    showAlert(error.message, "error");
  }
}

async function submitReset(event) {
  event.preventDefault();
  const sessionId = document.getElementById("admin-reset-session").value;
  if (!window.confirm(`Réinitialiser toutes les présences de la session #${sessionId} ?`)) return;

  try {
    await api(`/api/admin/attendance/reset/${encodeURIComponent(sessionId)}`, { method: "POST" });
    showAlert("Présences réinitialisées.");
  } catch (error) {
    showAlert(error.message, "error");
  }
}

function renderNfcLogs(logs) {
  const target = document.getElementById("admin-nfc-list");
  if (!target) return;

  if (!logs.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucun log NFC.</p>`;
    return;
  }

  target.innerHTML = `
    <table class="w-full min-w-[900px] text-left">
      <thead class="bg-neutral-100 text-xs uppercase text-neutral-500">
        <tr>
          <th class="px-2 py-2">Date</th>
          <th class="px-2 py-2">NFC</th>
          <th class="px-2 py-2">User</th>
          <th class="px-2 py-2">Session</th>
          <th class="px-2 py-2">IP</th>
          <th class="px-2 py-2">Fingerprint</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(log => `
          <tr class="border-t border-neutral-200">
            <td class="px-2 py-2 text-sm">${escapeHtml(formatDateTime(log.scannedAt))}</td>
            <td class="px-2 py-2 text-sm">${escapeHtml(log.nfcUid)}</td>
            <td class="px-2 py-2 text-sm">${escapeHtml(log.userId || "")}</td>
            <td class="px-2 py-2 text-sm">${escapeHtml(log.sessionId || "")}</td>
            <td class="px-2 py-2 text-sm">${escapeHtml(log.ipAddress || "")}</td>
            <td class="max-w-[260px] truncate px-2 py-2 text-sm" title="${escapeHtml(log.deviceFingerprint || "")}">${escapeHtml(log.deviceFingerprint || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadNfcLogs() {
  const logs = await api("/api/admin/nfc/logs");
  renderNfcLogs(logs || []);
}

export async function init() {
  if (window.SACApp?.user?.role !== "admin") {
    document.querySelector("[data-admin-panel='users']").innerHTML = `
      <div class="border border-red-200 bg-red-50 p-5 text-red-800">Accès réservé aux admins.</div>
    `;
    return;
  }

  document.querySelectorAll("[data-admin-tab]").forEach(button => {
    button.addEventListener("click", async () => {
      setActiveTab(button.dataset.adminTab);
      if (state.activeTab === "users") await loadUsers().catch(error => showAlert(error.message, "error"));
      if (state.activeTab === "sessions") await loadSessions().catch(error => showAlert(error.message, "error"));
      if (state.activeTab === "nfc") await loadNfcLogs().catch(error => showAlert(error.message, "error"));
    });
  });

  document.getElementById("admin-users-filter")?.addEventListener("submit", async event => {
    event.preventDefault();
    await loadUsers().catch(error => showAlert(error.message, "error"));
  });
  document.getElementById("admin-users-refresh")?.addEventListener("click", () => loadUsers().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-sessions-refresh")?.addEventListener("click", () => loadSessions().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-session-form")?.addEventListener("submit", saveSession);
  document.getElementById("admin-session-cancel")?.addEventListener("click", resetSessionForm);
  document.getElementById("admin-attendance-override")?.addEventListener("submit", submitOverride);
  document.getElementById("admin-attendance-reset")?.addEventListener("submit", submitReset);
  document.getElementById("admin-nfc-refresh")?.addEventListener("click", () => loadNfcLogs().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-system-test")?.addEventListener("click", async () => {
    try {
      const result = await api("/api/system/test");
      showAlert(result.message || "API disponible.");
    } catch (error) {
      showAlert(error.message, "error");
    }
  });

  const dateInput = document.getElementById("admin-sessions-date");
  if (dateInput) dateInput.value = toIsoDate();
  setActiveTab("users");
  await loadUsers().catch(error => showAlert(error.message, "error"));
}
