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
      <li class="flex items-center justify-between gap-4 border-t border-neutral-100 py-2 text-sm">
        <span>${student.lastName || ""} ${student.firstName || ""}</span>
        <span class="text-neutral-500">${student.edEmail || student.o365Email || ""}</span>
      </li>
    `).join("");

    target.innerHTML = `
      <h3 class="text-lg font-semibold">${data.name || data.label || "Classe"}</h3>
      <p class="mt-1 text-sm text-neutral-600">${students.length} eleve(s)</p>
      <ul class="mt-4">${rows || "<li class=\"text-sm text-neutral-500\">Aucun eleve trouvé.</li>"}</ul>
    `;
  } catch (error) {
    target.innerHTML = `<p class="text-sm text-red-700">${error.message}</p>`;
  }
}
