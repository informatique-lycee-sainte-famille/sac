// ./front/public/components/contents/admin/admin.content.js
const state = {
  activeTab: "users",
  users: [],
  sessions: [],
  rooms: [],
  usersFilters: {
    search: "",
    role: "",
    classId: "",
  },
  nfcReadAbortController: null,
  options: {
    classes: [],
    rooms: [],
    teachers: [],
  },
};

const PLACEHOLDER_AVATAR = "/ressources/ensemble_scolaire_lyce_sainte_famille_saintonge_formation_logo_512x512.png";

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

function confirmAdminAction({ title, message, confirmLabel = "Confirmer", danger = false }) {
  return new Promise(resolve => {
    document.getElementById("admin-confirm-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "admin-confirm-modal";
    modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4";
    modal.innerHTML = `
      <section class="w-full max-w-md border border-neutral-200 bg-white text-neutral-950 shadow-2xl" role="dialog" aria-modal="true">
        <div class="${danger ? "bg-red-700" : "bg-[#624292]"} px-5 py-4 text-white">
          <div class="flex items-start justify-between gap-4">
            <h2 class="text-xl font-semibold">${escapeHtml(title)}</h2>
            <button type="button" data-admin-confirm-cancel class="text-white/80 hover:text-white" aria-label="Annuler">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="p-5">
          <p class="text-sm leading-relaxed text-neutral-600">${escapeHtml(message)}</p>
          <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" data-admin-confirm-cancel class="border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">Annuler</button>
            <button type="button" data-admin-confirm-ok class="border ${danger ? "border-red-700 bg-red-700 hover:bg-red-800" : "border-[#624292] bg-[#624292] hover:bg-[#52357f]"} px-4 py-2 text-sm font-semibold text-white">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </section>
    `;
    const finish = value => {
      modal.remove();
      resolve(value);
    };
    modal.querySelectorAll("[data-admin-confirm-cancel]").forEach(button => button.addEventListener("click", () => finish(false)));
    modal.querySelector("[data-admin-confirm-ok]")?.addEventListener("click", () => finish(true));
    modal.addEventListener("click", event => {
      if (event.target === modal) finish(false);
    });
    document.body.appendChild(modal);
  });
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

function filteredUsers() {
  const query = state.usersFilters.search.trim().toLowerCase();
  const role = state.usersFilters.role || "";
  const classId = state.usersFilters.classId || "";

  return state.users.filter(user => {
    // Filter by role
    if (role && user.role !== role) return false;

    // Filter by class (for students)
    if (classId && String(user.classId) !== String(classId)) return false;

    // Filter by search query
    if (query) {
      const userText = [
        String(user.id),
        user.firstName || "",
        user.lastName || "",
        user.o365Email || "",
        user.edEmail || "",
        user.edId || "",
      ].join(" ").toLowerCase();
      if (!userText.includes(query)) return false;
    }

    return true;
  });
}

function getAvatarFallbacks(user) {
  // Priority order: Office 365 avatar → EcoleDirecte base64 → EcoleDirecte URL → Placeholder
  const fallbacks = [];
  
  if (user?.o365AvatarB64) {
    fallbacks.push(`${user.o365AvatarB64}`);
  }
  if (user?.edPhotoB64) {
    fallbacks.push(`${user.edPhotoB64}`);
  }
  if (user?.edPhotoUrl) {
    fallbacks.push(user.edPhotoUrl);
  }
  
  fallbacks.push(PLACEHOLDER_AVATAR);
  return fallbacks;
}

function avatarHtml(user, label) {
  const fallbacks = getAvatarFallbacks(user);
  const firstSrc = fallbacks[0];

  return `
    <img
      src="${escapeHtml(firstSrc)}"
      alt="${escapeHtml(label)}"
      data-avatar-fallbacks="${escapeHtml(JSON.stringify(fallbacks))}"
      data-avatar-index="0"
      class="h-10 w-10 shrink-0 rounded-full border border-neutral-200 bg-white object-cover"
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
      }, 5000);
      
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

function userRow(user) {
  const userName = `${user.lastName || ""} ${user.firstName || ""}`.trim() || "Sans nom";
  return `
    <tr class="border-t border-neutral-200">
      <td class="px-2 py-2 text-sm">${avatarHtml(user, userName)}</td>
      <td class="px-2 py-2 text-sm">${escapeHtml(user.id)}</td>
      <td class="px-2 py-2 text-sm">${escapeHtml(userName)}</td>
      <td class="px-2 py-2 text-sm">${escapeHtml(user.o365Email || user.edEmail || "")}</td>
      <td class="px-2 py-2 text-sm">
        <select data-user-role="${escapeHtml(user.id)}" class="border border-neutral-300 bg-white px-2 py-1 text-sm">
          ${["student", "teacher", "staff", "admin"].map(role => `
            <option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(roleLabel(role))}</option>
          `).join("")}
        </select>
      </td>
      <td class="px-2 py-2 text-right">
        <div class="inline-flex gap-1">
          <button type="button" data-save-user-role="${escapeHtml(user.id)}" class="inline-flex items-center gap-1 border border-[#624292] bg-[#624292] px-2 py-1.5 text-xs font-medium text-white transition hover:bg-[#52357f] whitespace-nowrap">
            <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
            <span>Sauver</span>
          </button>
          <button type="button" data-force-logout-user="${escapeHtml(user.id)}" class="inline-flex items-center gap-1 border border-amber-600 bg-amber-600 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 whitespace-nowrap" title="Déconnecter cet utilisateur">
            <i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
            <span>Déco</span>
          </button>
          <button type="button" data-delete-user="${escapeHtml(user.id)}" class="inline-flex items-center gap-1 border border-red-700 bg-red-700 px-2 py-1.5 text-xs font-medium text-white transition hover:bg-red-800 whitespace-nowrap" title="Supprimer cet utilisateur">
            <i class="fa-solid fa-trash" aria-hidden="true"></i>
            <span>Supp</span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderUsers() {
  const target = document.getElementById("admin-users-list");
  if (!target) return;

  const filtered = filteredUsers();

  if (!filtered.length) {
    target.innerHTML = `<p class="text-sm text-neutral-500">Aucun utilisateur trouvé.</p>`;
    return;
  }

  target.innerHTML = `
    <table class="w-full min-w-[800px] text-left">
      <thead class="bg-neutral-100 text-xs uppercase text-neutral-500">
        <tr>
          <th class="px-2 py-2 w-12">Photo</th>
          <th class="px-2 py-2">ID</th>
          <th class="px-2 py-2">Nom</th>
          <th class="px-2 py-2">Mail</th>
          <th class="px-2 py-2">Rôle</th>
          <th class="px-2 py-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>${filtered.map(userRow).join("")}</tbody>
    </table>
  `;

  bindAvatarFallbacks(target);

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

  document.querySelectorAll("[data-force-logout-user]").forEach(button => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.forceLogoutUser;
      const user = state.users.find(u => String(u.id) === String(userId));
      const userName = `${user?.lastName || ""} ${user?.firstName || ""}`.trim() || `utilisateur #${userId}`;

      const confirmed = await confirmAdminAction({
        title: "Déconnecter l'utilisateur",
        message: `Êtes-vous sûr de vouloir déconnecter ${escapeHtml(userName)} ? Cet utilisateur devra se reconnecter.`,
        confirmLabel: "Déconnecter",
      });

      if (!confirmed) return;

      try {
        await api(`/api/admin/users/${encodeURIComponent(userId)}/force-logout`, {
          method: "POST",
        });
        showAlert(`${userName} a été déconnecté.`);
        await loadUsers();
      } catch (error) {
        showAlert(error.message, "error");
      }
    });
  });

  document.querySelectorAll("[data-delete-user]").forEach(button => {
    button.addEventListener("click", async () => {
      const userId = button.dataset.deleteUser;
      const user = state.users.find(u => String(u.id) === String(userId));
      const userName = `${user?.lastName || ""} ${user?.firstName || ""}`.trim() || `utilisateur #${userId}`;

      const confirmed = await confirmAdminAction({
        title: "Supprimer le compte utilisateur",
        message: `Êtes-vous absolument sûr de vouloir supprimer le compte de ${escapeHtml(userName)} ? Cette action est irréversible et supprimera toutes les données associées.`,
        confirmLabel: "Supprimer définitivement",
        danger: true,
      });

      if (!confirmed) return;

      try {
        await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: "DELETE",
        });
        showAlert(`Compte de ${userName} supprimé.`);
        await loadUsers();
      } catch (error) {
        showAlert(error.message, "error");
      }
    });
  });
}

async function loadUsers() {
  try {
    state.users = await api("/api/admin/users");
    
    // Load classes for filter dropdown if not already loaded
    if (!state.options.classes.length) {
      const [classes, rooms, teachers] = await Promise.all([
        api("/api/admin/classes"),
        api("/api/admin/rooms"),
        api("/api/admin/teachers"),
      ]).catch(() => [[], [], []]);
      state.options.classes = classes;
      state.options.rooms = rooms;
      state.options.teachers = teachers;
      populateUserFilterOptions();
    }
    
    renderUsers();
  } catch (error) {
    showAlert(error.message, "error");
  }
}

function populateUserFilterOptions() {
  const classSelect = document.getElementById("admin-users-class");
  if (classSelect) {
    classSelect.innerHTML = [
      '<option value="">Tous</option>',
      ...state.options.classes.map(cls => optionHtml(cls.id, cls.name || cls.code)),
    ].join("");
  }
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

function selectedNfcRoom() {
  const roomId = document.getElementById("admin-nfc-room")?.value;
  return state.rooms.find(room => String(room.id) === String(roomId)) || null;
}

function updateNfcCardUrl() {
  const domainInput = document.getElementById("admin-nfc-domain");
  const uidInput = document.getElementById("admin-nfc-uid");
  const urlOutput = document.getElementById("admin-nfc-url");
  if (!domainInput || !uidInput || !urlOutput) return;

  const domain = (domainInput.value || window.location.origin).replace(/\/+$/, "");
  const uid = uidInput.value.trim();
  urlOutput.value = uid ? `${domain}/?nfc=${encodeURIComponent(uid)}` : "";
}

function canUseWebNfc() {
  return typeof window !== "undefined" && "NDEFReader" in window && window.isSecureContext;
}

function canLockWebNfc() {
  return canUseWebNfc() && typeof NDEFReader.prototype.makeReadOnly === "function";
}

function setAdminNfcIgnore(nfcUid) {
  const state = JSON.stringify({
    nfcUid,
    expiresAt: Date.now() + 45000,
  });
  sessionStorage.setItem("sacAdminNfcIgnore", state);
  localStorage.setItem("sacAdminNfcIgnore", state);
}

function setWebNfcStatus(message, type = "info") {
  const target = document.getElementById("admin-nfc-web-status");
  if (!target) return;

  const classes = {
    info: "border-neutral-200 bg-neutral-50 text-neutral-600",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
  };

  target.className = `mt-4 border p-3 text-sm ${classes[type] || classes.info}`;
  target.innerText = message;
}

function refreshWebNfcUi() {
  const supported = canUseWebNfc();
  const canLock = canLockWebNfc();
  document.getElementById("admin-nfc-web-write")?.classList.toggle("hidden", !supported);
  document.getElementById("admin-nfc-web-read")?.classList.toggle("hidden", !supported);
  document.getElementById("admin-nfc-web-lock")?.classList.toggle("hidden", !canLock);
  document.getElementById("admin-nfc-web-help")?.classList.toggle("hidden", !supported);
  document.getElementById("admin-nfc-web-unavailable")?.classList.toggle("hidden", supported);

  if (!window.isSecureContext) {
    setWebNfcStatus("L'ecriture NFC directe exige HTTPS ou localhost.", "warning");
    return;
  }

  setWebNfcStatus(
    supported
      ? "Ecriture directe disponible sur ce navigateur. Preparez une carte NDEF vierge ou reinscriptible."
      : "Ecriture directe non supportee ici. Utilisez NFC Tools pour programmer la carte.",
    supported ? "success" : "warning"
  );
}

function getGeneratedNfcUrl() {
  updateNfcCardUrl();
  return document.getElementById("admin-nfc-url")?.value || "";
}

function extractNfcUidFromUrl(value) {
  if (!value) return "";

  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.searchParams.get("nfc") || "";
  } catch (error) {
    return "";
  }
}

function getRoomByNfcUid(nfcUid) {
  return state.rooms.find(room => String(room.nfcUid) === String(nfcUid)) || null;
}

function readRecordData(record) {
  if (!record?.data) return "";

  try {
    if (typeof record.data === "string") return record.data;
    const decoder = new TextDecoder(record.encoding || "utf-8");
    return decoder.decode(record.data);
  } catch (error) {
    return "";
  }
}

function renderNfcReadResult({ serialNumber, url, nfcUid, room, records }) {
  const target = document.getElementById("admin-nfc-read-result");
  if (!target) return;

  const roomLabel = room
    ? `${room.name || room.code || `Salle #${room.id}`} (${room.nfcUid})`
    : nfcUid
      ? "UID SAC inconnu en base"
      : "Carte non liée à SAC";

  target.className = `mt-4 border p-4 text-sm ${room ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`;
  target.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div>
        <h4 class="text-base font-semibold">Carte lue</h4>
        <p class="mt-1 text-xs opacity-80">Le statut lecture seule n'est pas exposé de façon fiable par Web NFC.</p>
      </div>
      <i class="fa-solid ${room ? "fa-circle-check" : "fa-triangle-exclamation"} text-xl" aria-hidden="true"></i>
    </div>
    <dl class="mt-3 grid gap-2">
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">Salle</dt>
        <dd class="break-words">${escapeHtml(roomLabel)}</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">Room UID</dt>
        <dd class="break-words font-mono">${escapeHtml(nfcUid || "Non détecté")}</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">Serial number</dt>
        <dd class="break-words font-mono">${escapeHtml(serialNumber || "Non fourni par le navigateur")}</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">URL</dt>
        <dd class="break-words font-mono">${escapeHtml(url || "Aucune URL SAC détectée")}</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">Lecture seule</dt>
        <dd>Non disponible via Web NFC</dd>
      </div>
      <div class="grid gap-1 sm:grid-cols-[140px_1fr]">
        <dt class="font-semibold">Records</dt>
        <dd class="break-words">${escapeHtml(records.length ? records.join(", ") : "Aucun record lisible")}</dd>
      </div>
    </dl>
  `;
}

function stopNfcRead() {
  if (state.nfcReadAbortController) {
    state.nfcReadAbortController.abort();
    state.nfcReadAbortController = null;
  }
  document.getElementById("admin-nfc-web-stop-read")?.classList.add("hidden");
  setWebNfcStatus("Lecture NFC arrêtée.", "info");
}

async function startNfcRead() {
  if (!canUseWebNfc()) {
    showAlert("La lecture NFC directe n'est pas disponible sur ce navigateur.", "error");
    return;
  }

  stopNfcRead();
  const abortController = new AbortController();
  state.nfcReadAbortController = abortController;
  document.getElementById("admin-nfc-web-stop-read")?.classList.remove("hidden");

  try {
    const ndef = new NDEFReader();
    await ndef.scan({ signal: abortController.signal });
    setWebNfcStatus("Lecture active: approchez une carte NFC pour l'identifier.", "info");

    ndef.addEventListener("reading", event => {
      const records = Array.from(event.message?.records || []);
      const recordLabels = records.map(record => record.recordType || record.mediaType || "record");
      const values = records.map(readRecordData).filter(Boolean);
      const url = values.find(value => {
        try {
          const parsed = new URL(value, window.location.origin);
          return parsed.searchParams.has("nfc");
        } catch (error) {
          return false;
        }
      }) || values.find(value => /^https?:\/\//i.test(value)) || "";
      const nfcUid = extractNfcUidFromUrl(url);
      const room = getRoomByNfcUid(nfcUid);

      renderNfcReadResult({
        serialNumber: event.serialNumber || "",
        url,
        nfcUid,
        room,
        records: recordLabels,
      });
      setWebNfcStatus(room ? "Carte SAC identifiée." : "Carte lue, mais non reconnue comme salle SAC connue.", room ? "success" : "warning");
    });
  } catch (error) {
    if (error.name === "AbortError") return;
    state.nfcReadAbortController = null;
    document.getElementById("admin-nfc-web-stop-read")?.classList.add("hidden");
    setWebNfcStatus(error.message || "Lecture NFC impossible.", "error");
    showAlert(error.message || "Lecture NFC impossible.", "error");
  }
}

async function writeNfcCard() {
  const url = getGeneratedNfcUrl();
  if (!url) {
    showAlert("Aucune URL NFC a ecrire.", "error");
    return;
  }
  if (!canUseWebNfc()) {
    showAlert("L'ecriture NFC directe n'est pas disponible sur ce navigateur.", "error");
    return;
  }

  const confirmed = await confirmAdminAction({
    title: "Ecrire la carte NFC",
    message: `SAC va ecrire cette URL dans la carte NFC: ${url}. Approchez une carte NDEF vierge ou reinscriptible apres validation.`,
    confirmLabel: "Ecrire",
  });
  if (!confirmed) return;

  try {
    setWebNfcStatus("Permission NFC en attente, puis approchez la carte du telephone...", "info");
    const ndef = new NDEFReader();
    setAdminNfcIgnore(document.getElementById("admin-nfc-uid")?.value || "");
    await ndef.write({
      records: [
        {
          recordType: "url",
          data: url,
        },
      ],
    });
    setWebNfcStatus("Carte NFC ecrite. Scannez-la pour tester avant verrouillage definitif.", "success");
    showAlert("Carte NFC ecrite.");
  } catch (error) {
    setWebNfcStatus(error.message || "Ecriture NFC impossible.", "error");
    showAlert(error.message || "Ecriture NFC impossible.", "error");
  }
}

async function lockNfcCard() {
  if (!canLockWebNfc()) {
    showAlert("Le verrouillage NFC direct n'est pas disponible sur ce navigateur.", "error");
    return;
  }

  const firstConfirm = await confirmAdminAction({
    title: "Verrouillage definitif irreversible",
    message: "Avez-vous teste la carte avec succes ? Ce verrouillage met la carte en lecture seule permanente, sans mot de passe de deblocage.",
    confirmLabel: "Oui, continuer",
    danger: true,
  });
  if (!firstConfirm) return;

  const secondConfirm = await confirmAdminAction({
    title: "Derniere confirmation",
    message: "Apres cette operation, la carte ne pourra probablement plus etre modifiee. Approchez uniquement la carte correcte.",
    confirmLabel: "Verrouiller definitivement",
    danger: true,
  });
  if (!secondConfirm) return;

  try {
    setWebNfcStatus("Permission NFC en attente, puis approchez la carte a verrouiller definitivement...", "warning");
    const ndef = new NDEFReader();
    setAdminNfcIgnore(document.getElementById("admin-nfc-uid")?.value || "");
    await ndef.makeReadOnly();
    setWebNfcStatus("Carte NFC verrouillee definitivement en lecture seule.", "success");
    showAlert("Carte NFC verrouillee definitivement.");
  } catch (error) {
    setWebNfcStatus(error.message || "Verrouillage NFC impossible.", "error");
    showAlert(error.message || "Verrouillage NFC impossible.", "error");
  }
}

function renderNfcRooms() {
  const select = document.getElementById("admin-nfc-room");
  const domainInput = document.getElementById("admin-nfc-domain");
  if (domainInput && !domainInput.value) domainInput.value = window.location.origin;
  if (!select) return;

  select.innerHTML = state.rooms.length
    ? state.rooms.map(room => {
        const label = `${room.name || room.code || `Salle #${room.id}`} - ${room.nfcUid}`;
        return optionHtml(room.id, label);
      }).join("")
    : `<option value="">Aucune salle</option>`;

  const room = selectedNfcRoom();
  const uidInput = document.getElementById("admin-nfc-uid");
  if (uidInput && room) uidInput.value = room.nfcUid || "";
  updateNfcCardUrl();
  refreshWebNfcUi();
}

async function loadNfcRooms() {
  state.rooms = await api("/api/admin/rooms");
  renderNfcRooms();
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
      const confirmed = await confirmAdminAction({
        title: "Supprimer la session",
        message: "Supprimer cette session et ses informations associees ?",
        confirmLabel: "Supprimer",
        danger: true,
      });
      if (!confirmed) return;
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
  const confirmed = await confirmAdminAction({
    title: "Réinitialiser les présences",
    message: `Réinitialiser toutes les présences de la session #${sessionId} ?`,
    confirmLabel: "Réinitialiser",
    danger: true,
  });
  if (!confirmed) return;

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
      if (state.activeTab === "nfc-cards") await loadNfcRooms().catch(error => showAlert(error.message, "error"));
    });
  });

  document.getElementById("admin-users-filter")?.addEventListener("submit", async event => {
    event.preventDefault();
    state.usersFilters.search = document.getElementById("admin-users-search")?.value || "";
    state.usersFilters.role = document.getElementById("admin-users-role")?.value || "";
    state.usersFilters.classId = document.getElementById("admin-users-class")?.value || "";
    renderUsers();
  });

  document.getElementById("admin-users-search")?.addEventListener("input", event => {
    state.usersFilters.search = event.target.value || "";
    renderUsers();
  });

  document.getElementById("admin-users-role")?.addEventListener("change", event => {
    state.usersFilters.role = event.target.value || "";
    renderUsers();
  });

  document.getElementById("admin-users-class")?.addEventListener("change", event => {
    state.usersFilters.classId = event.target.value || "";
    renderUsers();
  });

  document.getElementById("admin-users-clear")?.addEventListener("click", async event => {
    event.preventDefault();
    document.getElementById("admin-users-search").value = "";
    document.getElementById("admin-users-role").value = "";
    document.getElementById("admin-users-class").value = "";
    state.usersFilters = { search: "", role: "", classId: "" };
    renderUsers();
  });

  document.getElementById("admin-users-refresh")?.addEventListener("click", () => loadUsers().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-sessions-refresh")?.addEventListener("click", () => loadSessions().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-session-form")?.addEventListener("submit", saveSession);
  document.getElementById("admin-session-cancel")?.addEventListener("click", resetSessionForm);
  document.getElementById("admin-attendance-override")?.addEventListener("submit", submitOverride);
  document.getElementById("admin-attendance-reset")?.addEventListener("submit", submitReset);
  document.getElementById("admin-nfc-refresh")?.addEventListener("click", () => loadNfcLogs().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-nfc-refresh-rooms")?.addEventListener("click", () => loadNfcRooms().catch(error => showAlert(error.message, "error")));
  document.getElementById("admin-nfc-domain")?.addEventListener("input", updateNfcCardUrl);
  document.getElementById("admin-nfc-uid")?.addEventListener("input", updateNfcCardUrl);
  document.getElementById("admin-nfc-room")?.addEventListener("change", () => {
    const room = selectedNfcRoom();
    const uidInput = document.getElementById("admin-nfc-uid");
    if (uidInput && room) uidInput.value = room.nfcUid || "";
    updateNfcCardUrl();
  });
  document.getElementById("admin-nfc-copy-url")?.addEventListener("click", async () => {
    const value = document.getElementById("admin-nfc-url")?.value || "";
    if (!value) {
      showAlert("Aucune URL NFC a copier.", "error");
      return;
    }
    try {
      if (!navigator.clipboard) throw new Error("Presse-papiers indisponible.");
      await navigator.clipboard.writeText(value);
      showAlert("URL NFC copiee.");
    } catch (error) {
      showAlert("Copie automatique impossible, selectionnez l'URL manuellement.", "error");
    }
  });
  document.getElementById("admin-nfc-web-write")?.addEventListener("click", writeNfcCard);
  document.getElementById("admin-nfc-web-read")?.addEventListener("click", startNfcRead);
  document.getElementById("admin-nfc-web-stop-read")?.addEventListener("click", stopNfcRead);
  document.getElementById("admin-nfc-web-lock")?.addEventListener("click", lockNfcCard);
  window.addEventListener("sac:admin-nfc-neutralized", event => {
    const nfcUid = event.detail?.nfcUid || "";
    setWebNfcStatus(`Scan NFC ignore apres ecriture admin (${nfcUid}). Vous restez dans l'outil cartes NFC.`, "success");
  });
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
  refreshWebNfcUi();
  if (sessionStorage.getItem("sacAdminOpenNfcCards") === "1") {
    sessionStorage.removeItem("sacAdminOpenNfcCards");
    setActiveTab("nfc-cards");
    await loadNfcRooms().catch(error => showAlert(error.message, "error"));
    return;
  }

  setActiveTab("users");
  await loadUsers().catch(error => showAlert(error.message, "error"));
}
