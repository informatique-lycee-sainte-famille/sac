// ./front/public/components/contents/my-courses/my-courses.content.js
const state = {
  selectedDate: toIsoDate(new Date()),
  view: "day",
  activeSessionId: null,
  realtimeSocket: null,
  realtimeSubscriptions: new Set(),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeSessionId(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const numericId = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
  return numericId;
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

function formatTime(value) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  document.querySelectorAll("[data-period-view]").forEach(button => {
    const isActive = button.dataset.periodView === state.view;
    button.classList.toggle("bg-[#624292]", isActive);
    button.classList.toggle("text-white", isActive);
    button.classList.toggle("bg-white", !isActive);
    button.classList.toggle("text-neutral-800", !isActive);
  });

  const prevLabel = document.getElementById("my-courses-prev-label");
  const nextLabel = document.getElementById("my-courses-next-label");
  const currentLabel = document.getElementById("my-courses-current-label");
  const labels = {
    day: ["Veille", "Aujourd'hui", "Lendemain"],
    week: ["Semaine préc.", "Cette semaine", "Semaine suiv."],
    month: ["Mois préc.", "Ce mois-ci", "Mois suiv."],
  };
  if (prevLabel) prevLabel.innerText = labels[state.view][0];
  if (currentLabel) currentLabel.innerText = labels[state.view][1];
  if (nextLabel) nextLabel.innerText = labels[state.view][2];

  const dayPdf = document.getElementById("my-courses-day-pdf");
  if (dayPdf) {
    dayPdf.classList.toggle("hidden", window.SACApp?.user?.role !== "teacher");
    dayPdf.classList.toggle("inline-flex", window.SACApp?.user?.role === "teacher");
    dayPdf.removeAttribute("href");
  }
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

function formatStatus(status) {
  const statuses = {
    scheduled: "Planifié",
    ongoing: "En cours",
    completed: "Terminé",
    cancelled: "Annulé",
  };

  return statuses[status] || status || "Planifié";
}

function formatAttendance(attendance, isFinalized) {
  if (attendance?.status === "present") return "Présent";
  if (attendance?.status === "absent") return "Absent";
  if (isFinalized) return "Appel envoyé";
  return "Non validé";
}

function attendanceClass(attendance, isFinalized) {
  if (attendance?.status === "present") return "bg-emerald-50 text-emerald-800";
  if (attendance?.status === "absent") return "bg-red-50 text-red-800";
  if (isFinalized) return "bg-amber-50 text-amber-800";
  return "bg-neutral-100 text-neutral-700";
}

function finalizationLabel(finalization) {
  return finalization?.sentToEdAt
    ? `Appel ED envoyé le ${formatDateTime(finalization.sentToEdAt)}`
    : "Appel ED non envoyé";
}

function teacherStatsHtml(stats, variant = "card") {
  if (!stats) return "";

  const items = [
    ["Présents", stats.presentCount ?? 0, "text-emerald-700"],
    ["Absents", stats.absentCount ?? 0, "text-red-700"],
    ["Présence", `${stats.presencePercent ?? 0}%`, "text-[#624292]"],
  ];
  const compact = variant === "card";

  return `
    <div class="${compact ? "mt-4 grid grid-cols-3 gap-2" : "mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3"}">
      ${items.map(([label, value, colorClass]) => `
        <div class="border border-neutral-200 bg-neutral-50 p-3">
          <p class="text-xs uppercase text-neutral-500">${escapeHtml(label)}</p>
          <p class="mt-1 text-lg font-semibold ${colorClass}">${escapeHtml(value)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSession(session) {
  const teacherName = `${session.teacher?.firstName || ""} ${session.teacher?.lastName || ""}`.trim();
  const title = session.label || session.matiere || session.codeMatiere || "Cours";
  const room = session.room?.name || session.room?.code || "Salle non definie";
  const className = session.class?.name || session.class?.code || "Classe non definie";
  const color = session.color || "#624292";
  const userRole = window.SACApp?.user?.role;
  const isTeacher = userRole === "teacher";
  const periodDate = state.view === "day"
    ? ""
    : `<span class="bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">${escapeHtml(formatShortDate(session.startTime))}</span>`;
  const pdfButton = userRole === "teacher"
    ? `<a
        href="/api/sessions/${session.id}/pdf"
        target="_blank"
        rel="noopener"
        class="border border-[#624292] bg-[#624292] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#52357f]"
      >
        PDF émargement
      </a>`
    : "";
  const statsHtml = isTeacher ? teacherStatsHtml(session.stats, "card") : "";

  return `
    <article class="border border-neutral-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <span class="h-10 w-1.5 shrink-0" style="background:${escapeHtml(color)}"></span>
            <div class="min-w-0">
              <h3 class="break-words text-lg font-semibold">${escapeHtml(title)}</h3>
              <p class="text-sm text-neutral-500">${formatTime(session.startTime)} - ${formatTime(session.endTime)}</p>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-xs">
          ${periodDate}
          <span class="bg-neutral-100 px-2 py-1 text-neutral-700">${escapeHtml(formatStatus(session.status))}</span>
          <span class="${attendanceClass(session.attendance, session.isFinalized)} px-2 py-1">${escapeHtml(formatAttendance(session.attendance, session.isFinalized))}</span>
        </div>
      </div>

      <dl class="mt-4 grid gap-3 text-sm text-neutral-700 sm:grid-cols-3">
        <div>
          <dt class="text-xs uppercase text-neutral-400">Classe</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(className)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Salle</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(room)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Enseignant</dt>
          <dd class="mt-1 break-words font-medium">${escapeHtml(teacherName || "Non renseigné")}</dd>
        </div>
      </dl>

      ${statsHtml}

      ${isTeacher ? `
        <p class="mt-3 text-xs font-medium ${session.finalization?.sentToEdAt ? "text-emerald-700" : "text-amber-700"}">
          ${escapeHtml(finalizationLabel(session.finalization))}
        </p>
      ` : ""}

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          data-session-details="${session.id}"
          class="border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
        >
          Voir le détail
        </button>
        ${pdfButton}
      </div>
    </article>
  `;
}

function detailRow(label, value) {
  return `
    <div class="grid grid-cols-1 gap-1 border-t border-neutral-200 py-2 sm:grid-cols-[140px_1fr]">
      <dt class="text-xs font-semibold uppercase text-neutral-500">${escapeHtml(label)}</dt>
      <dd class="break-words text-sm text-neutral-950">${escapeHtml(value || "Non renseigné")}</dd>
    </div>
  `;
}

function signatureBlock(record) {
  if (!record?.signature) {
    return `<div class="border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">Aucune signature enregistrée.</div>`;
  }

  return `
    <div class="border border-neutral-200 bg-white p-3">
      <img src="${escapeHtml(record.signature)}" alt="Signature" class="max-h-32 max-w-full object-contain" />
    </div>
  `;
}

function attendanceRows(records) {
  if (!records?.length) {
    return `<p class="text-sm text-neutral-500">Aucune présence enregistrée.</p>`;
  }

  return records.map(record => {
    const name = `${record.user?.lastName || ""} ${record.user?.firstName || ""}`.trim() || `Utilisateur #${record.userId}`;
    return `
      <tr class="border-t border-neutral-200">
        <td class="px-2 py-2 text-sm">${escapeHtml(name)}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(formatAttendance(record, false))}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(formatDateTime(record.scannedAt))}</td>
        <td class="px-2 py-2 text-sm">${record.signature ? "Oui" : "Non"}</td>
      </tr>
    `;
  }).join("");
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

    await loadCourses();
    if (state.activeSessionId && Number(state.activeSessionId) === Number(message.sessionId)) {
      await openCourseModal(message.sessionId, { keepExisting: true });
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

function studentRows(students, canManageAttendance) {
  if (!students?.length) {
    return `<p class="text-sm text-neutral-500">Aucun élève trouvé pour cette classe.</p>`;
  }

  return students.map(student => {
    const record = student.attendance;
    const name = `${student.lastName || ""} ${student.firstName || ""}`.trim() || `Élève #${student.id}`;
    const status = formatAttendance(record, false);
    const canManage = canManageAttendance;
    return `
      <tr class="border-t border-neutral-200">
        <td class="px-2 py-2 text-sm font-medium">${escapeHtml(name)}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(status)}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(formatDateTime(record?.scannedAt))}</td>
        <td class="px-2 py-2 text-sm">${record?.signature ? "Oui" : "Non"}</td>
        <td class="px-2 py-2">
          <div class="flex min-w-52 flex-col gap-2">
            <input
              type="text"
              data-manual-comment="${escapeHtml(student.id)}"
              value="${escapeHtml(record?.comment || "")}"
              maxlength="500"
              placeholder="Commentaire optionnel"
              class="${canManage ? "" : "hidden"} w-full border border-neutral-300 px-2 py-1 text-xs"
            />
            ${record?.comment ? `<p class="text-xs text-neutral-500">${escapeHtml(record.comment)}</p>` : ""}
            <div class="flex flex-wrap gap-1">
            <button
              type="button"
              data-manual-attendance="${escapeHtml(student.id)}"
              data-manual-status="present"
              class="${canManage ? "" : "hidden"} inline-flex items-center gap-1 border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              Présent
            </button>
            <button
              type="button"
              data-manual-attendance="${escapeHtml(student.id)}"
              data-manual-status="absent"
              class="${canManage ? "" : "hidden"} inline-flex items-center gap-1 border border-red-600 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800 hover:bg-red-100"
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

function bindManualAttendanceActions(sessionId) {
  document.querySelectorAll("[data-manual-attendance]").forEach(button => {
    button.addEventListener("click", async () => {
      const studentId = button.dataset.manualAttendance;
      const status = button.dataset.manualStatus;
      const comment = document.querySelector(`[data-manual-comment="${CSS.escape(studentId)}"]`)?.value || "";
      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>...</span>`;

      try {
        await setManualAttendance(sessionId, studentId, status, comment);
        await loadCourses();
        await openCourseModal(sessionId, { keepExisting: true });
      } catch (error) {
        alert(error.message);
      } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    });
  });
}

function closeCourseModal() {
  document.getElementById("course-session-modal")?.remove();
  state.activeSessionId = null;
}

async function openCourseModal(sessionId, options = {}) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (normalizedSessionId === null) {
    throw new Error("Identifiant de session invalide.");
  }

  if (!options.keepExisting) {
    closeCourseModal();
  }
  state.activeSessionId = normalizedSessionId;
  subscribeRealtimeSession(normalizedSessionId);

  let modal = document.getElementById("course-session-modal");
  if (!modal) {
    modal = document.createElement("div");
  }
  modal.id = "course-session-modal";
  modal.className = "fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-black/60 p-4";
  modal.innerHTML = `
    <div class="w-full max-w-3xl bg-white p-5 text-neutral-950 shadow-2xl">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold">Détail du cours</h2>
          <p class="mt-1 text-sm text-neutral-500">Chargement...</p>
        </div>
        <button type="button" data-course-modal-close class="border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
      </div>
    </div>
  `;
  if (!modal.dataset.closeBound) {
    modal.addEventListener("click", event => {
      if (event.target === modal || event.target.closest("[data-course-modal-close]")) {
        closeCourseModal();
      }
    });
    modal.dataset.closeBound = "true";
  }
  if (!modal.isConnected) {
    document.body.appendChild(modal);
  }

  try {
    const response = await fetch(`/api/sessions/${normalizedSessionId}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || "Impossible de charger le détail du cours.");
    }

    const title = data.label || data.matiere || data.codeMatiere || "Cours";
    const teacherName = `${data.teacher?.firstName || ""} ${data.teacher?.lastName || ""}`.trim();
    const currentRecord = data.currentUserAttendance;
    const isTeacherView = Boolean(data.canGeneratePdf);
    const statsHtml = isTeacherView ? teacherStatsHtml(data.stats, "modal") : "";
    const teacherPdf = data.canGeneratePdf
      ? `<a href="/api/sessions/${data.id}/pdf" target="_blank" rel="noopener" class="inline-flex border border-[#624292] bg-[#624292] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#52357f]">Générer le PDF d'émargement</a>`
      : "";
    const attendanceTable = data.attendance?.length && data.canGeneratePdf
      ? `
        <div class="mt-5">
          <h3 class="text-base font-semibold">Présences du cours</h3>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full min-w-[560px] border border-neutral-200 text-left">
              <thead class="bg-neutral-100 text-xs uppercase text-neutral-500">
                <tr>
                  <th class="px-2 py-2">Utilisateur</th>
                  <th class="px-2 py-2">Statut</th>
                  <th class="px-2 py-2">Scan</th>
                  <th class="px-2 py-2">Signature</th>
                </tr>
              </thead>
              <tbody>${attendanceRows(data.attendance)}</tbody>
            </table>
          </div>
        </div>
      `
      : "";
    const manualAttendanceTable = data.canGeneratePdf
      ? `
        <div class="mt-5">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 class="text-base font-semibold">Appel manuel</h3>
              <p class="text-sm text-neutral-500">Suivi live du cours et correction si un élève n'a pas de téléphone, pas de NFC, ou si le scan échoue.</p>
            </div>
            ${data.canManageAttendance ? "" : `<p class="text-sm font-medium text-amber-700">Appel déjà finalisé ou modification indisponible.</p>`}
          </div>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full min-w-[720px] border border-neutral-200 text-left">
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
      `
      : "";

    modal.innerHTML = `
      <div class="w-full max-w-3xl bg-white p-5 text-neutral-950 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="break-words text-xl font-semibold">${escapeHtml(title)}</h2>
            <p class="mt-1 text-sm text-neutral-500">${formatTime(data.startTime)} - ${formatTime(data.endTime)}</p>
          </div>
          <button type="button" data-course-modal-close class="shrink-0 border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
        </div>

        <dl class="mt-4">
          ${detailRow("Classe", data.class?.name || data.class?.code)}
          ${detailRow("Salle", data.room?.name || data.room?.code)}
          ${detailRow("Enseignant", teacherName)}
          ${detailRow("Statut cours", formatStatus(data.status))}
          ${isTeacherView ? detailRow("Validation ED", finalizationLabel(data.finalization)) : ""}
          ${detailRow("Mon statut", formatAttendance(currentRecord, Boolean(data.finalization)))}
          ${detailRow("Mon scan NFC", formatDateTime(currentRecord?.scannedAt))}
        </dl>

        ${statsHtml}

        ${manualAttendanceTable}

        <div class="mt-5">
          <h3 class="text-base font-semibold">Ma signature</h3>
          <div class="mt-2">${signatureBlock(currentRecord)}</div>
        </div>

        ${attendanceTable}

        <div class="mt-5 flex flex-wrap gap-2">
          ${teacherPdf}
        </div>
      </div>
    `;
    bindManualAttendanceActions(data.id);
  } catch (error) {
    modal.innerHTML = `
      <div class="w-full max-w-lg bg-white p-5 text-neutral-950 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <p class="text-sm font-medium text-red-700">${escapeHtml(error.message)}</p>
          <button type="button" data-course-modal-close class="border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100">Fermer</button>
        </div>
      </div>
    `;
  }
}

function bindCourseActions() {
  document.querySelectorAll("[data-session-details]").forEach(button => {
    button.addEventListener("click", () => openCourseModal(button.dataset.sessionDetails));
  });
}

async function loadCourses() {
  const target = document.getElementById("my-courses-content");
  const calendar = document.getElementById("my-courses-calendar");
  const dateTarget = document.getElementById("my-courses-date");
  if (!target) return;

  if (calendar) calendar.value = state.selectedDate;
  if (dateTarget) dateTarget.innerText = formatPeriodLabel();
  syncViewControls();

  target.innerHTML = `
    <div class="border border-neutral-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-neutral-600">Chargement des cours...</p>
    </div>
  `;

  try {
    const response = await fetch(`/api/sessions/today?date=${encodeURIComponent(state.selectedDate)}&view=${encodeURIComponent(state.view)}`);
    const payload = await response.json().catch(() => ({}));
    const data = Array.isArray(payload) ? payload : payload.sessions;

    if (!response.ok) {
      throw new Error(payload.message || payload.error || "Impossible de charger les cours.");
    }

    if (!Array.isArray(data) || data.length === 0) {
      syncDayPdfLink([]);
      target.innerHTML = `
        <div class="border border-neutral-200 bg-white p-5 shadow-sm">
          <p class="text-sm text-neutral-600">Aucun cours trouvé pour cette période.</p>
        </div>
      `;
      return;
    }

    syncDayPdfLink(data);
    target.innerHTML = data.map(renderSession).join("");
    if (window.SACApp?.user?.role === "teacher") {
      data.forEach(session => subscribeRealtimeSession(session.id));
    }
    bindCourseActions();
  } catch (error) {
    syncDayPdfLink([]);
    target.innerHTML = `
      <div class="border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm">
        <p class="text-sm font-medium">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function syncDayPdfLink(sessions) {
  const dayPdf = document.getElementById("my-courses-day-pdf");
  if (!dayPdf || window.SACApp?.user?.role !== "teacher") return;

  const classId = sessions.find(session => session.class?.id)?.class?.id;
  if (state.view !== "day" || !classId) {
    dayPdf.removeAttribute("href");
    dayPdf.classList.add("pointer-events-none", "opacity-50");
    return;
  }

  dayPdf.href = `/api/attendance/pdf/day?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(state.selectedDate)}`;
  dayPdf.classList.remove("pointer-events-none", "opacity-50");
}

export async function init() {
  const refreshButton = document.getElementById("my-courses-refresh");
  const calendar = document.getElementById("my-courses-calendar");

  document.getElementById("my-courses-prev")?.addEventListener("click", async () => {
    shiftPeriod(-1);
    await loadCourses();
  });
  document.getElementById("my-courses-next")?.addEventListener("click", async () => {
    shiftPeriod(1);
    await loadCourses();
  });
  document.getElementById("my-courses-today")?.addEventListener("click", async () => {
    state.selectedDate = toIsoDate(new Date());
    await loadCourses();
  });
  calendar?.addEventListener("change", async () => {
    if (calendar.value) {
      state.selectedDate = calendar.value;
      await loadCourses();
    }
  });

  document.querySelectorAll("[data-period-view]").forEach(button => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.periodView || "day";
      await loadCourses();
    });
  });

  refreshButton?.addEventListener("click", loadCourses);
  await loadCourses();
}
