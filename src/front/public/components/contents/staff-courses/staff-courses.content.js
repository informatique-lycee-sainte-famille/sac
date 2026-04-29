// ./front/public/components/contents/staff-courses/staff-courses.content.js
const state = {
  selectedDate: toIsoDate(new Date()),
  view: "day",
  filters: {
    classId: "",
    roomId: "",
    teacherId: "",
    subject: "",
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

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftPeriod(direction) {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  if (state.view === "month") {
    date.setMonth(date.getMonth() + direction);
  } else {
    date.setDate(date.getDate() + (state.view === "week" ? 7 : 1) * direction);
  }
  state.selectedDate = toIsoDate(date);
}

function formatDate(value = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${toIsoDate(value)}T12:00:00`));
}

function periodBounds() {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  if (state.view === "month") {
    const start = new Date(date.getFullYear(), date.getMonth(), 1, 12);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
    return { start, end };
  }

  if (state.view === "week") {
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  return { start: date, end: date };
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatPeriodLabel() {
  if (state.view === "day") return formatDate(state.selectedDate);

  const { start, end } = periodBounds();
  if (state.view === "week") {
    return `Semaine du ${formatShortDate(start)} au ${formatShortDate(end)}`;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(start);
}

function syncViewControls() {
  document.querySelectorAll("[data-staff-period-view]").forEach(button => {
    const isActive = button.dataset.staffPeriodView === state.view;
    button.classList.toggle("bg-[#624292]", isActive);
    button.classList.toggle("text-white", isActive);
    button.classList.toggle("bg-white", !isActive);
    button.classList.toggle("text-neutral-800", !isActive);
  });

  const prevLabel = document.getElementById("staff-courses-prev-label");
  const nextLabel = document.getElementById("staff-courses-next-label");
  const currentLabel = document.getElementById("staff-courses-current-label");
  const labels = {
    day: ["Veille", "Aujourd'hui", "Lendemain"],
    week: ["Semaine préc.", "Cette semaine", "Semaine suiv."],
    month: ["Mois préc.", "Ce mois-ci", "Mois suiv."],
  };
  if (prevLabel) prevLabel.innerText = labels[state.view][0];
  if (currentLabel) currentLabel.innerText = labels[state.view][1];
  if (nextLabel) nextLabel.innerText = labels[state.view][2];
}

function formatTime(value) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "Non envoyé";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(status) {
  const statuses = {
    scheduled: "Planifié",
    ongoing: "En cours",
    completed: "Terminé",
    cancelled: "Annulé",
  };

  return statuses[status] || status || "Planifié";
}

function teacherName(teacher) {
  return `${teacher?.lastName || ""} ${teacher?.firstName || ""}`.trim() || "Enseignant non renseigné";
}

function optionHtml(value, label, selectedValue) {
  const selected = String(value) === String(selectedValue) ? "selected" : "";
  return `<option value="${escapeHtml(value)}" ${selected}>${escapeHtml(label)}</option>`;
}

function fillSelect(id, options, currentValue, labelBuilder) {
  const select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = [
    optionHtml("", "Tous", currentValue),
    ...options.map(option => optionHtml(option.id, labelBuilder(option), currentValue)),
  ].join("");
}

function syncDateUi() {
  const input = document.getElementById("staff-courses-date");
  const label = document.getElementById("staff-courses-date-label");
  if (input) input.value = state.selectedDate;
  if (label) label.innerText = formatPeriodLabel();
  syncViewControls();
}

function readFilters() {
  state.filters = {
    classId: document.getElementById("staff-filter-class")?.value || "",
    roomId: document.getElementById("staff-filter-room")?.value || "",
    teacherId: document.getElementById("staff-filter-teacher")?.value || "",
    subject: document.getElementById("staff-filter-subject")?.value || "",
  };
}

function buildQuery() {
  const params = new URLSearchParams({ date: state.selectedDate, view: state.view });
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function metricCard(icon, label, value, detail, colorClass = "text-[#624292]") {
  return `
    <div class="border border-neutral-200 bg-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase text-neutral-500">${escapeHtml(label)}</p>
          <p class="mt-2 text-2xl font-semibold ${colorClass}">${escapeHtml(value)}</p>
          <p class="mt-1 text-xs text-neutral-500">${escapeHtml(detail)}</p>
        </div>
        <i class="fa-solid ${escapeHtml(icon)} text-xl text-neutral-300" aria-hidden="true"></i>
      </div>
    </div>
  `;
}

function renderSummary(summary) {
  const target = document.getElementById("staff-courses-summary");
  if (!target) return;

  const global = summary?.global || {};
  target.innerHTML = `
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      ${metricCard("fa-calendar-check", "Cours", global.sessions ?? 0, `${global.finalizedSessions ?? 0} appel(s) envoyé(s) à ED`)}
      ${metricCard("fa-users", "Élèves attendus", global.expectedStudents ?? 0, "Total cumulé sur les cours filtrés", "text-neutral-950")}
      ${metricCard("fa-user-check", "Présents", global.presentCount ?? 0, `${global.absentCount ?? 0} absent(s)`, "text-emerald-700")}
      ${metricCard("fa-chart-line", "Taux de présence", `${global.presencePercent ?? 0}%`, "Présences / élèves attendus", rateColor(global.presencePercent))}
    </div>
  `;
}

function rateColor(rate) {
  if (rate >= 90) return "text-emerald-700";
  if (rate >= 75) return "text-amber-700";
  return "text-red-700";
}

function barColor(rate) {
  if (rate >= 90) return "bg-emerald-600";
  if (rate >= 75) return "bg-amber-500";
  return "bg-red-600";
}

function chartPanel(title, icon, rows) {
  const safeRows = rows?.length ? rows : [];
  const body = safeRows.length
    ? safeRows.map(row => `
        <div class="grid gap-2 border-t border-neutral-100 py-3 sm:grid-cols-[minmax(140px,220px)_1fr_72px] sm:items-center">
          <div class="min-w-0">
            <p class="break-words text-sm font-medium text-neutral-950">${escapeHtml(row.label)}</p>
            <p class="text-xs text-neutral-500">${escapeHtml(row.sessions)} cours · ${escapeHtml(row.presentCount)}/${escapeHtml(row.expectedStudents)} présents</p>
          </div>
          <div class="h-3 overflow-hidden bg-neutral-100">
            <div class="h-full ${barColor(row.presencePercent)}" style="width:${Math.max(0, Math.min(row.presencePercent || 0, 100))}%"></div>
          </div>
          <p class="text-right text-sm font-semibold ${rateColor(row.presencePercent)}">${escapeHtml(row.presencePercent)}%</p>
        </div>
      `).join("")
    : `<p class="border-t border-neutral-100 py-4 text-sm text-neutral-500">Aucune donnée pour ce filtre.</p>`;

  return `
    <section class="border border-neutral-200 bg-white p-4 shadow-sm">
      <div class="flex items-center gap-2">
        <i class="fa-solid ${escapeHtml(icon)} text-[#624292]" aria-hidden="true"></i>
        <h3 class="text-base font-semibold">${escapeHtml(title)}</h3>
      </div>
      <div class="mt-3">${body}</div>
    </section>
  `;
}

function renderDashboard(summary) {
  const target = document.getElementById("staff-courses-dashboard");
  if (!target) return;

  target.innerHTML = `
    <div class="grid gap-4">
      ${chartPanel("Taux par classe", "fa-people-group", summary?.byClass)}
      ${chartPanel("Taux par matière", "fa-book-open", summary?.bySubject)}
    </div>
    <div class="grid gap-4">
      ${chartPanel("Taux par enseignant", "fa-chalkboard-user", summary?.byTeacher)}
      ${chartPanel("Taux par salle", "fa-door-open", summary?.byRoom)}
    </div>
  `;
}

function finalizationBadge(session) {
  if (session.finalization?.sentToEdAt) {
    return `
      <span class="inline-flex items-center gap-1 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
        <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        ED ${escapeHtml(formatDateTime(session.finalization.sentToEdAt))}
      </span>
    `;
  }

  return `
    <span class="inline-flex items-center gap-1 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      Appel non envoyé
    </span>
  `;
}

function renderSessionRow(session) {
  const className = session.class?.name || session.class?.code || "Classe non renseignée";
  const roomName = session.room?.name || session.room?.code || "Salle non renseignée";
  const stats = session.stats || {};
  const periodDate = state.view === "day"
    ? ""
    : `<span class="bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">${escapeHtml(formatShortDate(session.startTime))}</span>`;

  return `
    <article class="border border-neutral-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <h3 class="break-words text-lg font-semibold">${escapeHtml(session.label)}</h3>
          <p class="mt-1 text-sm text-neutral-500">${formatTime(session.startTime)} - ${formatTime(session.endTime)} · ${escapeHtml(formatStatus(session.status))}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${periodDate}
          ${finalizationBadge(session)}
          <span class="bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">${escapeHtml(stats.presencePercent ?? 0)}% présence</span>
        </div>
      </div>

      <dl class="mt-4 grid gap-3 text-sm text-neutral-700 md:grid-cols-4">
        <div>
          <dt class="text-xs uppercase text-neutral-400">Classe</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(className)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Salle</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(roomName)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Enseignant</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(teacherName(session.teacher))}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Présence</dt>
          <dd class="mt-1 font-medium">${escapeHtml(stats.presentCount ?? 0)}/${escapeHtml(stats.totalStudents ?? 0)} présents · ${escapeHtml(stats.absentCount ?? 0)} absents</dd>
        </div>
      </dl>
    </article>
  `;
}

function renderSessions(sessions) {
  const target = document.getElementById("staff-courses-list");
  if (!target) return;

  if (!sessions?.length) {
    target.innerHTML = `
      <div class="border border-neutral-200 bg-white p-5 shadow-sm">
        <p class="text-sm text-neutral-600">Aucun cours trouvé pour ces filtres.</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-lg font-semibold">Cours filtrés</h3>
      <span class="text-sm text-neutral-500">${sessions.length} résultat(s)</span>
    </div>
    <div class="space-y-3">${sessions.map(renderSessionRow).join("")}</div>
  `;
}

function renderLoading() {
  document.getElementById("staff-courses-summary").innerHTML = "";
  document.getElementById("staff-courses-dashboard").innerHTML = "";
  document.getElementById("staff-courses-list").innerHTML = `
    <div class="border border-neutral-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-neutral-600">Chargement des cours...</p>
    </div>
  `;
}

function renderError(error) {
  document.getElementById("staff-courses-summary").innerHTML = "";
  document.getElementById("staff-courses-dashboard").innerHTML = "";
  document.getElementById("staff-courses-list").innerHTML = `
    <div class="border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm">
      <p class="text-sm font-medium">${escapeHtml(error.message)}</p>
    </div>
  `;
}

function populateFilters(options) {
  fillSelect("staff-filter-class", options?.classes || [], state.filters.classId, option => option.name || option.code);
  fillSelect("staff-filter-room", options?.rooms || [], state.filters.roomId, option => option.name || option.code);
  fillSelect("staff-filter-teacher", options?.teachers || [], state.filters.teacherId, teacherName);
  fillSelect("staff-filter-subject", options?.subjects || [], state.filters.subject, option => option.name);
}

async function loadStaffCourses() {
  syncDateUi();
  renderLoading();

  try {
    const response = await fetch(`/api/sessions/staff?${buildQuery()}`);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Impossible de charger les cours.");
    }

    populateFilters(payload.options);
    renderSummary(payload.summary);
    renderDashboard(payload.summary);
    renderSessions(payload.sessions);
  } catch (error) {
    renderError(error);
  }
}

async function loadStaffCoursesFromControls() {
  readFilters();
  await loadStaffCourses();
}

export async function init() {
  const dateInput = document.getElementById("staff-courses-date");
  const filterForm = document.getElementById("staff-courses-filters");

  document.getElementById("staff-courses-prev")?.addEventListener("click", async () => {
    shiftPeriod(-1);
    await loadStaffCoursesFromControls();
  });
  document.getElementById("staff-courses-next")?.addEventListener("click", async () => {
    shiftPeriod(1);
    await loadStaffCoursesFromControls();
  });
  document.getElementById("staff-courses-today")?.addEventListener("click", async () => {
    state.selectedDate = toIsoDate(new Date());
    await loadStaffCoursesFromControls();
  });
  document.getElementById("staff-courses-refresh")?.addEventListener("click", loadStaffCoursesFromControls);
  document.getElementById("staff-courses-clear")?.addEventListener("click", async () => {
    state.filters = { classId: "", roomId: "", teacherId: "", subject: "" };
    await loadStaffCourses();
  });
  dateInput?.addEventListener("change", async () => {
    if (dateInput.value) {
      state.selectedDate = dateInput.value;
      await loadStaffCoursesFromControls();
    }
  });
  filterForm?.addEventListener("submit", async event => {
    event.preventDefault();
    readFilters();
    await loadStaffCourses();
  });

  document.querySelectorAll("[data-staff-period-view]").forEach(button => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.staffPeriodView || "day";
      await loadStaffCoursesFromControls();
    });
  });

  await loadStaffCourses();
}
