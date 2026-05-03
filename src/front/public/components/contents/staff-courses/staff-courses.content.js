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
  activeSessionId: null,
  realtimeSocket: null,
  realtimeSubscriptions: new Set(),
  teacherOptions: [],
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
  if (!value) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getCookie(name) {
  return document.cookie
    .split(";")
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function connectRealtime() {
  if (state.realtimeSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.realtimeSocket.readyState)) {
    return state.realtimeSocket;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws/realtime`);
  state.realtimeSocket = socket;

  socket.addEventListener("open", () => {
    state.realtimeSubscriptions.forEach(sessionId => {
      socket.send(JSON.stringify({ type: "subscribe", sessionId }));
    });
  });

  socket.addEventListener("message", async event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type !== "attendance.updated") return;

    await loadStaffCourses();
    if (state.activeSessionId && Number(state.activeSessionId) === Number(message.sessionId)) {
      await openStaffCourseModal(message.sessionId, { keepExisting: true });
    }
  });

  socket.addEventListener("close", () => {
    if (state.realtimeSocket === socket) {
      state.realtimeSocket = null;
    }
  });

  return socket;
}

function subscribeRealtimeSession(sessionId) {
  state.realtimeSubscriptions.add(String(sessionId));
  const socket = connectRealtime();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe", sessionId }));
  }
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

function formatAttendance(record) {
  if (!record) return "Absent";
  return record.status === "present" ? "Présent" : "Absent";
}

function studentRows(students, canManageAttendance) {
  if (!students?.length) {
    return `<tr><td colspan="5" class="px-2 py-3 text-sm text-neutral-500">Aucun élève trouvé pour cette classe.</td></tr>`;
  }

  return students.map(student => {
    const record = student.attendance;
    const name = `${student.lastName || ""} ${student.firstName || ""}`.trim() || `Élève #${student.id}`;
    return `
      <tr class="border-t border-neutral-200">
        <td class="px-2 py-2 text-sm font-medium">${escapeHtml(name)}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(formatAttendance(record))}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(formatDateTime(record?.scannedAt))}</td>
        <td class="px-2 py-2 text-sm">${record?.signature ? "Oui" : "Non"}</td>
        <td class="px-2 py-2">
          <div class="flex min-w-52 flex-col gap-2">
            <input
              type="text"
              data-staff-manual-comment="${escapeHtml(student.id)}"
              value="${escapeHtml(record?.comment || "")}"
              maxlength="500"
              placeholder="Commentaire optionnel"
              class="${canManageAttendance ? "" : "hidden"} w-full border border-neutral-300 px-2 py-1 text-xs"
            />
            ${record?.comment ? `<p class="text-xs text-neutral-500">${escapeHtml(record.comment)}</p>` : ""}
            <div class="flex flex-wrap gap-1">
            <button
              type="button"
              data-staff-manual-attendance="${escapeHtml(student.id)}"
              data-staff-manual-status="present"
              class="${canManageAttendance ? "" : "hidden"} inline-flex items-center gap-1 border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              Présent
            </button>
            <button
              type="button"
              data-staff-manual-attendance="${escapeHtml(student.id)}"
              data-staff-manual-status="absent"
              class="${canManageAttendance ? "" : "hidden"} inline-flex items-center gap-1 border border-red-600 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              Absent
            </button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function setManualAttendance(sessionId, studentId, status, comment = "") {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/attendance/manual`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCookie("XSRF-TOKEN"),
    },
    body: JSON.stringify({ studentId: Number(studentId), status, comment }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Validation manuelle impossible.");
  }

  return data;
}

async function setSessionTeacher(sessionId, teacherId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/teacher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCookie("XSRF-TOKEN"),
    },
    body: JSON.stringify({ teacherId: Number(teacherId) }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Remplacement enseignant impossible.");
  }

  return data;
}

function closeStaffCourseModal() {
  document.getElementById("staff-course-session-modal")?.remove();
  state.activeSessionId = null;
}

function bindManualAttendanceActions(sessionId) {
  document.querySelectorAll("[data-staff-manual-attendance]").forEach(button => {
    button.addEventListener("click", async () => {
      const studentId = button.dataset.staffManualAttendance;
      const status = button.dataset.staffManualStatus;
      const comment = document.querySelector(`[data-staff-manual-comment="${CSS.escape(studentId)}"]`)?.value || "";
      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>...</span>`;

      try {
        await setManualAttendance(sessionId, studentId, status, comment);
        await loadStaffCourses();
        await openStaffCourseModal(sessionId, { keepExisting: true });
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    });
  });
}

function bindTeacherReplacementAction(sessionId) {
  document.querySelector("[data-staff-teacher-replace]")?.addEventListener("click", async buttonEvent => {
    const button = buttonEvent.currentTarget;
    const teacherId = document.querySelector("[data-staff-replacement-teacher]")?.value;
    if (!teacherId) return;

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>...</span>`;

    try {
      await setSessionTeacher(sessionId, teacherId);
      await loadStaffCourses();
      await openStaffCourseModal(sessionId, { keepExisting: true });
    } catch (error) {
      alert(error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  });
}

async function openStaffCourseModal(sessionId, options = {}) {
  if (!options.keepExisting) {
    closeStaffCourseModal();
  }
  state.activeSessionId = Number(sessionId);
  subscribeRealtimeSession(sessionId);

  let modal = document.getElementById("staff-course-session-modal");
  if (!modal) {
    modal = document.createElement("div");
  }
  modal.id = "staff-course-session-modal";
  modal.className = "fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-black/60 p-4";
  modal.innerHTML = `
    <div class="w-full max-w-4xl bg-white p-5 text-neutral-950 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">Détail du cours</h2>
          <p class="mt-1 text-sm text-neutral-500">Chargement...</p>
        </div>
        <button type="button" data-staff-course-modal-close class="border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
      </div>
    </div>
  `;
  if (!modal.dataset.closeBound) {
    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest("[data-staff-course-modal-close]")) {
        closeStaffCourseModal();
      }
    });
    modal.dataset.closeBound = "true";
  }
  if (!modal.isConnected) {
    document.body.appendChild(modal);
  }

  try {
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || "Impossible de charger le détail du cours.");
    }

    const replacementOptions = state.teacherOptions.map(teacher => `
      <option value="${escapeHtml(teacher.id)}" ${Number(teacher.id) === Number(data.teacher?.id) ? "selected" : ""}>
        ${escapeHtml(teacherName(teacher))}
      </option>
    `).join("");

    modal.innerHTML = `
      <div class="w-full max-w-5xl bg-white p-5 text-neutral-950 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="break-words text-xl font-semibold">${escapeHtml(data.label || data.matiere || "Cours")}</h2>
            <p class="mt-1 text-sm text-neutral-500">
              ${escapeHtml(formatDate(data.startTime))} · ${formatTime(data.startTime)} - ${formatTime(data.endTime)}
            </p>
          </div>
          <button type="button" data-staff-course-modal-close class="border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
        </div>

        <div class="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div class="border border-neutral-200 p-3">
            <p class="text-xs uppercase text-neutral-400">Classe</p>
            <p class="mt-1 font-medium">${escapeHtml(data.class?.name || data.class?.code || "Non renseignée")}</p>
          </div>
          <div class="border border-neutral-200 p-3">
            <p class="text-xs uppercase text-neutral-400">Salle</p>
            <p class="mt-1 font-medium">${escapeHtml(data.room?.name || data.room?.code || "Non renseignée")}</p>
          </div>
          <div class="border border-neutral-200 p-3">
            <p class="text-xs uppercase text-neutral-400">Présents</p>
            <p class="mt-1 font-medium text-emerald-700">${escapeHtml(data.stats?.presentCount ?? 0)}/${escapeHtml(data.stats?.totalStudents ?? 0)}</p>
          </div>
          <div class="border border-neutral-200 p-3">
            <p class="text-xs uppercase text-neutral-400">Présence</p>
            <p class="mt-1 font-medium ${rateColor(data.stats?.presencePercent ?? 0)}">${escapeHtml(data.stats?.presencePercent ?? 0)}%</p>
          </div>
        </div>

        <div class="mt-5">
          <div class="border border-[#624292]/25 bg-[#624292]/5 p-4">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 class="text-base font-semibold">Remplacement enseignant</h3>
                <p class="text-sm text-neutral-500">Permet d'affecter l'enseignant réellement présent avant finalisation.</p>
              </div>
              <div class="flex flex-col gap-2 sm:flex-row">
                <select data-staff-replacement-teacher class="min-w-64 border border-neutral-300 bg-white px-3 py-2 text-sm">
                  ${replacementOptions}
                </select>
                <button type="button" data-staff-teacher-replace class="${data.finalization ? "hidden" : ""} inline-flex items-center justify-center gap-2 border border-[#624292] bg-[#624292] px-3 py-2 text-sm font-semibold text-white hover:bg-[#52357f]">
                  <i class="fa-solid fa-user-pen" aria-hidden="true"></i>
                  Remplacer
                </button>
              </div>
            </div>
          </div>

          <div class="mt-5">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 class="text-base font-semibold">Suivi live et appel manuel</h3>
              <p class="text-sm text-neutral-500">Les scans élèves apparaissent presque instantanément. Correction disponible tant que l'appel n'est pas finalisé.</p>
            </div>
            ${data.canManageAttendance ? "" : `<p class="text-sm font-medium text-amber-700">Appel déjà finalisé ou modification indisponible.</p>`}
          </div>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full min-w-[760px] border border-neutral-200 text-left">
              <thead class="bg-neutral-100 text-xs uppercase text-neutral-500">
                <tr>
                  <th class="px-2 py-2">Élève</th>
                  <th class="px-2 py-2">Statut</th>
                  <th class="px-2 py-2">Validation</th>
                  <th class="px-2 py-2">Signature</th>
                  <th class="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>${studentRows(data.students, data.canManageAttendance)}</tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    `;
    bindManualAttendanceActions(data.id);
    bindTeacherReplacementAction(data.id);
  } catch (error) {
    modal.innerHTML = `
      <div class="w-full max-w-lg bg-white p-5 text-neutral-950 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold">Erreur</h2>
            <p class="mt-2 text-sm text-red-700">${escapeHtml(error.message)}</p>
          </div>
          <button type="button" data-staff-course-modal-close class="border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
        </div>
      </div>
    `;
  }
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
          <button type="button" data-staff-session-detail="${escapeHtml(session.id)}" class="inline-flex items-center gap-1 border border-[#624292] bg-white px-2 py-1 text-xs font-semibold text-[#624292] transition hover:bg-[#f3eef9]">
            <i class="fa-solid fa-clipboard-check" aria-hidden="true"></i>
            Appel
          </button>
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

  document.querySelectorAll("[data-staff-session-detail]").forEach(button => {
    button.addEventListener("click", () => openStaffCourseModal(button.dataset.staffSessionDetail));
  });
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
  state.teacherOptions = options?.teachers || [];
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
