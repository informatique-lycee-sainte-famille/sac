// ./front/public/components/contents/staff-teachers/staff-teachers.content.js
const state = {
  teachers: [],
  summary: null,
  selectedTeacherId: null,
  search: "",
};
const PLACEHOLDER_AVATAR = "/resources/ensemble_scolaire_lycee_sainte_famille_saintonge_formation_logo_512x512.png";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "Jamais";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLastSession(user) {
  if (user.lastLoginAt) return formatDateTime(user.lastLoginAt);
  return user.hasLoggedIn ? "Session expirée ou purgée" : "Jamais";
}

function teacherName(teacher) {
  return `${teacher.lastName || ""} ${teacher.firstName || ""}`.trim() || `Utilisateur #${teacher.id}`;
}

function statusBadge(ok, yesLabel, noLabel) {
  const classes = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
  return `<span class="inline-flex border px-2 py-1 text-xs font-semibold ${classes}">${escapeHtml(ok ? yesLabel : noLabel)}</span>`;
}

function getAvatarFallbacks(user) {
  return [
    user.o365AvatarB64,
    PLACEHOLDER_AVATAR,
  ].filter(Boolean);
}

function avatarHtml(user, label, sizeClass = "h-14 w-14") {
  const fallbacks = getAvatarFallbacks(user);
  const firstSrc = fallbacks[0] || PLACEHOLDER_AVATAR;

  return `
    <img
      src="${escapeHtml(firstSrc)}"
      alt="${escapeHtml(label)}"
      data-avatar-fallbacks="${escapeHtml(JSON.stringify(fallbacks))}"
      data-avatar-index="0"
      class="${escapeHtml(sizeClass)} shrink-0 rounded-full border border-neutral-200 bg-white object-cover"
    />
  `;
}

function bindAvatarFallbacks(root = document) {
  root.querySelectorAll("img[data-avatar-fallbacks]").forEach(image => {
    if (image.dataset.avatarBound === "true") return;
    image.dataset.avatarBound = "true";
    image.addEventListener("error", () => {
      const fallbacks = JSON.parse(image.dataset.avatarFallbacks || "[]");
      const nextIndex = Number(image.dataset.avatarIndex || 0) + 1;
      if (fallbacks[nextIndex]) {
        image.dataset.avatarIndex = String(nextIndex);
        image.src = fallbacks[nextIndex];
      }
    });
  });
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function filteredTeachers() {
  const query = state.search.trim().toLowerCase();
  if (!query) return state.teachers;

  return state.teachers.filter(teacher => {
    const lastCourse = teacher.lastCourse || {};
    const text = [
      teacherName(teacher),
      teacher.o365Email,
      teacher.edId,
      lastCourse.label,
      lastCourse.matiere,
      lastCourse.class?.name,
      lastCourse.class?.code,
      lastCourse.room?.name,
      lastCourse.room?.code,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query);
  });
}

function renderTeacherList() {
  const target = document.getElementById("staff-teachers-list");
  const summary = document.getElementById("staff-teachers-summary");
  if (!target) return;

  const teachers = filteredTeachers();
  const global = state.summary || {};
  if (summary) {
    summary.innerText = `${global.teachersCount || state.teachers.length} enseignant(s), ${global.loggedInCount || 0} connecté(s), ${global.scannedCount || 0} avec scan NFC`;
  }

  if (!teachers.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucun enseignant trouvé.</p>`;
    return;
  }

  target.innerHTML = teachers.map(teacher => {
    const isSelected = String(teacher.id) === String(state.selectedTeacherId);
    return `
      <button type="button" data-staff-teacher-id="${escapeHtml(teacher.id)}" class="w-full border px-3 py-3 text-left transition ${isSelected ? "border-[#624292] bg-[#624292] text-white" : "border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50"}">
        <span class="flex items-center gap-3">
          ${avatarHtml(teacher, teacherName(teacher), "h-10 w-10")}
          <span class="min-w-0">
            <span class="block break-words text-sm font-semibold">${escapeHtml(teacherName(teacher))}</span>
            <span class="mt-1 block text-xs ${isSelected ? "text-white/80" : "text-neutral-500"}">${escapeHtml(teacher.teachingSessionsCount || 0)} cours · ${teacher.hasLoggedIn ? "connecté" : "jamais connecté"}</span>
          </span>
        </span>
      </button>
    `;
  }).join("");

  target.querySelectorAll("[data-staff-teacher-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedTeacherId = Number(button.dataset.staffTeacherId);
      renderTeacherList();
      renderTeacherDetail();
    });
  });
  bindAvatarFallbacks(target);
}

function metricCard(label, value, detail, colorClass = "text-[#624292]") {
  return `
    <div class="border border-neutral-200 bg-neutral-50 p-3">
      <p class="text-xs font-semibold uppercase text-neutral-500">${escapeHtml(label)}</p>
      <p class="mt-1 text-2xl font-semibold ${colorClass}">${escapeHtml(value)}</p>
      <p class="mt-1 text-xs text-neutral-500">${escapeHtml(detail)}</p>
    </div>
  `;
}

function formatCourse(course) {
  if (!course) return "Aucun cours connu";
  const label = course.label || course.matiere || "Cours";
  const classLabel = course.class?.name || course.class?.code || "Classe inconnue";
  const roomLabel = course.room?.name || course.room?.code || "Salle inconnue";
  return `${label} · ${classLabel} · ${roomLabel} · ${formatDateTime(course.startTime)}`;
}

function renderTeacherDetail() {
  const target = document.getElementById("staff-teacher-detail");
  if (!target) return;

  const teacher = state.teachers.find(item => String(item.id) === String(state.selectedTeacherId));
  if (!teacher) {
    target.innerHTML = `<p class="text-sm text-neutral-600">Sélectionnez un enseignant.</p>`;
    return;
  }

  const finalizedRate = percent(teacher.finalizedSessionsCount, teacher.teachingSessionsCount);

  target.innerHTML = `
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0">
        <div class="flex items-start gap-4">
          ${avatarHtml(teacher, teacherName(teacher), "h-16 w-16")}
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="break-words text-2xl font-semibold">${escapeHtml(teacherName(teacher))}</h3>
              ${statusBadge(teacher.hasO365AccountLinked, "Compte lié", "Compte non lié")}
              ${statusBadge(teacher.hasLoggedIn, "Déjà connecté", "Jamais connecté")}
            </div>
            <p class="mt-1 text-sm text-neutral-500">ID App #${escapeHtml(teacher.id)} · ID ED ${escapeHtml(teacher.edId || "N/A")}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Cours connus", teacher.teachingSessionsCount || 0, "Sessions affectées à l'enseignant", "text-neutral-950")}
      ${metricCard("Cours finalisés", `${teacher.finalizedSessionsCount || 0} (${finalizedRate}%)`, "Appels validés/envoyés", finalizedRate >= 80 ? "text-emerald-700" : "text-amber-700")}
      ${metricCard("Présences prof", teacher.attendanceRecordsCount || 0, "Émargements enseignant", "text-[#624292]")}
      ${metricCard("Scans NFC", teacher.nfcScansCount || 0, "Scans enregistrés", teacher.nfcScansCount > 0 ? "text-emerald-700" : "text-amber-700")}
    </div>

    <div class="mt-5 grid gap-3 xl:grid-cols-2">
      <div class="border border-neutral-200 bg-neutral-50 p-4">
        <h4 class="text-sm font-semibold uppercase text-neutral-500">Identité et accès</h4>
        <dl class="mt-3 grid gap-2 text-sm">
          <div><dt class="font-medium text-neutral-800">Mail O365</dt><dd class="break-words text-neutral-600">${escapeHtml(teacher.o365Email || "Non renseigné")}</dd></div>
          <div><dt class="font-medium text-neutral-800">Dernière session navigateur</dt><dd class="text-neutral-600">${escapeHtml(formatLastSession(teacher))}</dd></div>
          <div><dt class="font-medium text-neutral-800">Dernier scan NFC</dt><dd class="text-neutral-600">${escapeHtml(formatDateTime(teacher.lastNfcScanAt))}</dd></div>
        </dl>
      </div>

      <div class="border border-neutral-200 bg-neutral-50 p-4">
        <h4 class="text-sm font-semibold uppercase text-neutral-500">Activité cours</h4>
        <dl class="mt-3 grid gap-2 text-sm">
          <div><dt class="font-medium text-neutral-800">Dernier cours connu</dt><dd class="break-words text-neutral-600">${escapeHtml(formatCourse(teacher.lastCourse))}</dd></div>
          <div><dt class="font-medium text-neutral-800">Dernière validation d'appel</dt><dd class="text-neutral-600">${escapeHtml(formatDateTime(teacher.lastFinalizationAt))}</dd></div>
        </dl>
      </div>
    </div>
  `;
  bindAvatarFallbacks(target);
}

async function loadTeachers() {
  const response = await fetch("/api/user/teachers");
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Impossible de charger les enseignants.");
  }

  state.teachers = data.teachers || [];
  state.summary = data.summary || null;
  if (!state.selectedTeacherId || !state.teachers.some(teacher => String(teacher.id) === String(state.selectedTeacherId))) {
    state.selectedTeacherId = state.teachers[0]?.id || null;
  }

  renderTeacherList();
  renderTeacherDetail();
}

function renderError(message) {
  const target = document.getElementById("staff-teacher-detail");
  if (target) {
    target.innerHTML = `<p class="text-sm text-red-700">${escapeHtml(message)}</p>`;
  }
}

function bindEvents() {
  document.getElementById("staff-teachers-search")?.addEventListener("input", event => {
    state.search = event.target.value || "";
    renderTeacherList();
  });

  document.getElementById("staff-teachers-refresh")?.addEventListener("click", async () => {
    await loadTeachers().catch(error => renderError(error.message));
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
  await loadTeachers().catch(error => renderError(error.message));
}
