// ./front/public/components/contents/staff-classes/staff-classes.content.js
const state = {
  classes: [],
  selectedClassId: null,
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

function formatLastSession(student) {
  if (student.lastLoginAt) {
    return formatDateTime(student.lastLoginAt);
  }

  return student.hasLoggedIn ? "Session expirée ou purgée" : "Jamais";
}

function studentName(student) {
  return `${student.lastName || ""} ${student.firstName || ""}`.trim() || `Utilisateur #${student.id}`;
}

function statusBadge(ok, yesLabel, noLabel) {
  const classes = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
  return `<span class="inline-flex border px-2 py-1 text-xs font-semibold ${classes}">${escapeHtml(ok ? yesLabel : noLabel)}</span>`;
}

function getAvatarFallbacks(user, includeEdPhoto = false) {
  return [
    includeEdPhoto ? user.edPhotoB64 : null,
    user.o365AvatarB64,
    PLACEHOLDER_AVATAR,
  ].filter(Boolean);
}

function avatarHtml(user, label, includeEdPhoto = false) {
  const fallbacks = getAvatarFallbacks(user, includeEdPhoto);
  const firstSrc = fallbacks[0] || PLACEHOLDER_AVATAR;

  return `
    <img
      src="${escapeHtml(firstSrc)}"
      alt="${escapeHtml(label)}"
      data-avatar-fallbacks="${escapeHtml(JSON.stringify(fallbacks))}"
      data-avatar-index="0"
      class="h-12 w-12 shrink-0 rounded-full border border-neutral-200 bg-white object-cover"
    />
  `;
}

function bindAvatarFallbacks(root = document) {
  root.querySelectorAll("img[data-avatar-fallbacks]").forEach(image => {
    if (image.dataset.avatarBound !== "true") {
      image.dataset.avatarBound = "true";
      
      // Function to trigger fallback to next avatar source
      const triggerFallback = () => {
        const fallbacks = JSON.parse(image.dataset.avatarFallbacks || "[]");
        const nextIndex = Number(image.dataset.avatarIndex || 0) + 1;
        if (fallbacks[nextIndex]) {
          image.dataset.avatarIndex = String(nextIndex);
          image.src = fallbacks[nextIndex];
        }
      };
      
      // 5 second timeout for image load
      let loadTimeout = setTimeout(() => {
        triggerFallback();
      }, 3000);
      
      // Clear timeout on successful load
      image.addEventListener("load", () => {
        clearTimeout(loadTimeout);
      }, { once: true });
      
      // Handle explicit load errors
      image.addEventListener("error", () => {
        clearTimeout(loadTimeout);
        triggerFallback();
      });
    }
  });
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function filteredClasses() {
  const query = state.search.trim().toLowerCase();
  if (!query) return state.classes;

  return state.classes.filter(cls => {
    const classText = `${cls.name || ""} ${cls.code || ""} ${cls.edId || ""}`.toLowerCase();
    const studentText = (cls.students || []).map(student => (
      `${studentName(student)} ${student.o365Email || ""} ${student.edEmail || ""} ${student.edId || ""}`
    )).join(" ").toLowerCase();
    return `${classText} ${studentText}`.includes(query);
  });
}

function renderClassList() {
  const target = document.getElementById("staff-classes-list");
  const summary = document.getElementById("staff-classes-summary");
  if (!target) return;

  const classes = filteredClasses();
  const totalStudents = state.classes.reduce((sum, cls) => sum + (cls.studentsCount || 0), 0);
  if (summary) {
    summary.innerText = `${state.classes.length} classe(s), ${totalStudents} élève(s)`;
  }

  if (!classes.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucune classe trouvée.</p>`;
    return;
  }

  target.innerHTML = classes.map(cls => {
    const isSelected = String(cls.id) === String(state.selectedClassId);
    return `
      <button type="button" data-staff-class-id="${escapeHtml(cls.id)}" class="w-full border px-3 py-3 text-left transition ${isSelected ? "border-[#624292] bg-[#624292] text-white" : "border-neutral-200 bg-white text-neutral-950 hover:bg-neutral-50"}">
        <span class="block break-words text-sm font-semibold">${escapeHtml(cls.name || cls.code || "Classe")}</span>
        <span class="mt-1 block text-xs ${isSelected ? "text-white/80" : "text-neutral-500"}">${escapeHtml(cls.studentsCount)} élève(s) · ${escapeHtml(cls.loggedInCount)} connecté(s)</span>
      </button>
    `;
  }).join("");

  target.querySelectorAll("[data-staff-class-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedClassId = Number(button.dataset.staffClassId);
      renderClassList();
      renderClassDetail();
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

function renderStudentRow(student) {
  return `
    <article class="border-t border-neutral-100 py-4">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <div class="flex items-start gap-3">
            ${avatarHtml(student, studentName(student), true)}
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="break-words text-base font-semibold text-neutral-950">${escapeHtml(studentName(student))}</h4>
                ${statusBadge(student.hasO365AccountLinked, "Compte lié", "Compte non lié")}
                ${statusBadge(student.hasLoggedIn, "Déjà connecté", "Jamais connecté")}
              </div>
              <div class="mt-2 grid gap-1 text-sm text-neutral-600 md:grid-cols-2">
                <p class="break-words"><span class="font-medium text-neutral-800">O365:</span> ${escapeHtml(student.o365Email || "Non renseigné")}</p>
                <p class="break-words"><span class="font-medium text-neutral-800">ED:</span> ${escapeHtml(student.edEmail || "Non renseigné")}</p>
                <p><span class="font-medium text-neutral-800">ID App:</span> #${escapeHtml(student.id)}</p>
                <p><span class="font-medium text-neutral-800">ID ED:</span> ${escapeHtml(student.edId || "Non renseigné")}</p>
              </div>
            </div>
          </div>
        </div>
        <div class="grid gap-2 text-sm text-neutral-600 sm:grid-cols-2 xl:w-[420px]">
          <div class="border border-neutral-100 bg-neutral-50 p-2">
            <p class="text-xs font-semibold uppercase text-neutral-500">Dernière connexion</p>
            <p class="mt-1 text-neutral-900">${escapeHtml(formatLastSession(student))}</p>
          </div>
          <div class="border border-neutral-100 bg-neutral-50 p-2">
            <p class="text-xs font-semibold uppercase text-neutral-500">Dernier scan</p>
            <p class="mt-1 text-neutral-900">${escapeHtml(formatDateTime(student.lastNfcScanAt))}</p>
          </div>
          <div class="border border-neutral-100 bg-neutral-50 p-2">
            <p class="text-xs font-semibold uppercase text-neutral-500">Présences</p>
            <p class="mt-1 text-neutral-900">${escapeHtml(student.attendanceRecordsCount || 0)} enregistrement(s)</p>
          </div>
          <div class="border border-neutral-100 bg-neutral-50 p-2">
            <p class="text-xs font-semibold uppercase text-neutral-500">Dernier statut</p>
            <p class="mt-1 text-neutral-900">${escapeHtml(student.lastAttendance?.status || "Aucun")}</p>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderClassDetail() {
  const target = document.getElementById("staff-class-detail");
  if (!target) return;

  const cls = state.classes.find(item => String(item.id) === String(state.selectedClassId));
  if (!cls) {
    target.innerHTML = `<p class="text-sm text-neutral-600">Sélectionnez une classe.</p>`;
    return;
  }

  const students = cls.students || [];
  const linkedRate = percent(cls.linkedCount, cls.studentsCount);
  const loginRate = percent(cls.loggedInCount, cls.studentsCount);
  const scanRate = percent(cls.scannedCount, cls.studentsCount);

  target.innerHTML = `
    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div>
        <h3 class="break-words text-2xl font-semibold">${escapeHtml(cls.name || cls.code || "Classe")}</h3>
        <p class="mt-1 text-sm text-neutral-500">Code ${escapeHtml(cls.code || "N/A")} · ED ${escapeHtml(cls.edId || "N/A")} · ${escapeHtml(cls.sessionsCount || 0)} cours connu(s)</p>
      </div>
    </div>

    <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Élèves", cls.studentsCount || 0, "Comptes élèves dans la classe", "text-neutral-950")}
      ${metricCard("Comptes liés", `${cls.linkedCount || 0} (${linkedRate}%)`, "Compte O365 associé", linkedRate >= 80 ? "text-emerald-700" : "text-amber-700")}
      ${metricCard("Connexions", `${cls.loggedInCount || 0} (${loginRate}%)`, "Au moins une connexion SAC", loginRate >= 80 ? "text-emerald-700" : "text-amber-700")}
      ${metricCard("Scans NFC", `${cls.scannedCount || 0} (${scanRate}%)`, "Au moins un scan enregistré", scanRate >= 80 ? "text-emerald-700" : "text-amber-700")}
    </div>

    <div class="mt-5">
      <h4 class="text-lg font-semibold">Élèves</h4>
      <div class="mt-2">
        ${students.length ? students.map(renderStudentRow).join("") : `<p class="text-sm text-neutral-500">Aucun élève trouvé.</p>`}
      </div>
    </div>
  `;
  bindAvatarFallbacks(target);
}

async function loadClasses() {
  const response = await fetch("/api/classes/staff");
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Impossible de charger les classes.");
  }

  state.classes = data.classes || [];
  if (!state.selectedClassId || !state.classes.some(cls => String(cls.id) === String(state.selectedClassId))) {
    state.selectedClassId = state.classes[0]?.id || null;
  }

  renderClassList();
  renderClassDetail();
}

function renderError(message) {
  const target = document.getElementById("staff-class-detail");
  if (target) {
    target.innerHTML = `<p class="text-sm text-red-700">${escapeHtml(message)}</p>`;
  }
}

function bindEvents() {
  document.getElementById("staff-classes-search")?.addEventListener("input", event => {
    state.search = event.target.value || "";
    renderClassList();
  });

  document.getElementById("staff-classes-refresh")?.addEventListener("click", async () => {
    await loadClasses().catch(error => renderError(error.message));
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
  await loadClasses().catch(error => renderError(error.message));
}
