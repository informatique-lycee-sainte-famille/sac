// ./front/public/components/footer/footer.component.js
export function init() {
  const currentYear = document.getElementById("current-year");
  if (currentYear) {
    currentYear.innerText = new Date().getFullYear();
  }
}
