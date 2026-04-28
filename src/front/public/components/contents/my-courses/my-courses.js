function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  }).format(new Date(value));
}

function formatStatus(status) {
  const statuses = {
    scheduled: "Planifie",
    ongoing: "En cours",
    completed: "Termine",
    cancelled: "Annule",
  };

  return statuses[status] || status || "Planifie";
}

function formatAttendance(attendance, isFinalized) {
  if (attendance?.status === "present") return "Presence validee";
  if (attendance?.status === "absent") return "Absent";
  if (isFinalized) return "Appel envoye";
  return "Non valide";
}

function renderSession(session) {
  const teacherName = `${session.teacher?.firstName || ""} ${session.teacher?.lastName || ""}`.trim();
  const title = session.label || session.matiere || session.codeMatiere || "Cours";
  const room = session.room?.name || session.room?.code || "Salle non definie";
  const className = session.class?.name || session.class?.code || "Classe non definie";
  const color = session.color || "#624292";

  return `
    <article class="border border-neutral-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <span class="h-10 w-1.5 shrink-0" style="background:${escapeHtml(color)}"></span>
            <div class="min-w-0">
              <h3 class="truncate text-lg font-semibold">${escapeHtml(title)}</h3>
              <p class="text-sm text-neutral-500">${formatTime(session.startTime)} - ${formatTime(session.endTime)}</p>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 text-xs">
          <span class="bg-neutral-100 px-2 py-1 text-neutral-700">${escapeHtml(formatStatus(session.status))}</span>
          <span class="bg-neutral-100 px-2 py-1 text-neutral-700">${escapeHtml(formatAttendance(session.attendance, session.isFinalized))}</span>
        </div>
      </div>

      <dl class="mt-4 grid gap-3 text-sm text-neutral-700 sm:grid-cols-3">
        <div>
          <dt class="text-xs uppercase text-neutral-400">Classe</dt>
          <dd class="mt-1 font-medium">${escapeHtml(className)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Salle</dt>
          <dd class="mt-1 font-medium">${escapeHtml(room)}</dd>
        </div>
        <div>
          <dt class="text-xs uppercase text-neutral-400">Enseignant</dt>
          <dd class="mt-1 font-medium">${escapeHtml(teacherName || "Non renseigne")}</dd>
        </div>
      </dl>
    </article>
  `;
}

async function loadCourses() {
  const target = document.getElementById("my-courses-content");
  if (!target) return;

  target.innerHTML = `
    <div class="border border-neutral-200 bg-white p-5 shadow-sm">
      <p class="text-sm text-neutral-600">Chargement des cours...</p>
    </div>
  `;

  try {
    const response = await fetch("/api/sessions/today");
    const data = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(data.message || data.error || "Impossible de charger les cours.");
    }

    if (!Array.isArray(data) || data.length === 0) {
      target.innerHTML = `
        <div class="border border-neutral-200 bg-white p-5 shadow-sm">
          <p class="text-sm text-neutral-600">Aucun cours trouve pour aujourd'hui.</p>
        </div>
      `;
      return;
    }

    target.innerHTML = data.map(renderSession).join("");
  } catch (error) {
    target.innerHTML = `
      <div class="border border-red-200 bg-red-50 p-5 text-red-800 shadow-sm">
        <p class="text-sm font-medium">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

export async function init() {
  const dateTarget = document.getElementById("my-courses-date");
  const refreshButton = document.getElementById("my-courses-refresh");

  if (dateTarget) {
    dateTarget.innerText = formatDate();
  }

  refreshButton?.addEventListener("click", loadCourses);
  await loadCourses();
}
