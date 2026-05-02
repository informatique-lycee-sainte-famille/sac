// ./front/public/components/contents/my-class/my-class.content.js
const PLACEHOLDER_AVATAR = "/ressources/ensemble_scolaire_lycee_sainte_famille_saintonge_formation_logo_512x512.png";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function studentName(student) {
  return `${student.lastName || ""} ${student.firstName || ""}`.trim() || `Élève #${student.id}`;
}

function getAvatarFallbacks(student) {
  return [
    student.edPhotoB64,
    student.o365AvatarB64,
    PLACEHOLDER_AVATAR,
  ].filter(Boolean);
}

function avatarHtml(student) {
  const label = studentName(student);
  const fallbacks = getAvatarFallbacks(student);
  const firstSrc = fallbacks[0] || PLACEHOLDER_AVATAR;

  return `
    <img
      src="${escapeHtml(firstSrc)}"
      alt="${escapeHtml(label)}"
      data-avatar-fallbacks="${escapeHtml(JSON.stringify(fallbacks))}"
      data-avatar-index="0"
      class="h-11 w-11 shrink-0 rounded-full border border-neutral-200 bg-white object-cover"
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

export async function init() {
  const target = document.getElementById("my-class-content");
  if (!target) return;

  try {
    const response = await fetch("/api/classes/me");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || data.error || "Impossible de charger la classe.");
    }

    const students = data.users || data.students || [];
    const rows = students.map(student => `
      <li class="flex items-center justify-between gap-4 border-t border-neutral-100 py-2.5 text-sm">
        <div class="flex min-w-0 items-center gap-3">
          ${avatarHtml(student)}
          <span class="min-w-0 truncate font-medium">${escapeHtml(studentName(student))}</span>
        </div>
        <span class="shrink-0 text-neutral-500">Élève</span>
      </li>
    `).join("");

    target.innerHTML = `
      <h3 class="text-lg font-semibold">${escapeHtml(data.name || data.label || "Classe")}</h3>
      <p class="mt-1 text-sm text-neutral-600">${students.length} élève(s)</p>
      <ul class="mt-4">${rows || "<li class=\"text-sm text-neutral-500\">Aucun eleve trouvé.</li>"}</ul>
    `;
    bindAvatarFallbacks(target);
  } catch (error) {
    target.innerHTML = `<p class="text-sm text-red-700">${escapeHtml(error.message)}</p>`;
  }
}
