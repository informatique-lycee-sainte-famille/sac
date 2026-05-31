// ./front/public/components/footer/footer.component.js
const GUIDE_BY_ROLE = {
  student: "/resources/Guide_utilisation_SAC_eleves.docx",
  teacher: "/resources/Guide_utilisation_SAC_enseignants.docx",
  staff: "/resources/Guide_utilisation_SAC_personnels.docx",
  admin: "/resources/Guide_utilisation_SAC_admins.docx",
};

function updateHelpLink(user = window.SACApp?.user) {
  const link = document.getElementById("footer-help-link");
  if (!link) return;

  const guideUrl = GUIDE_BY_ROLE[user?.role];
  link.classList.toggle("hidden", !guideUrl);
  if (!guideUrl) {
    link.href = "#";
    link.removeAttribute("download");
    return;
  }

  const filename = guideUrl.split("/").pop();
  link.href = guideUrl;
  link.setAttribute("download", filename);
}

export function init() {
  const currentYear = document.getElementById("current-year");
  if (currentYear) {
    currentYear.innerText = new Date().getFullYear();
  }

  updateHelpLink();
  window.addEventListener("sac:user-updated", event => {
    updateHelpLink(event.detail?.user);
  });
}
