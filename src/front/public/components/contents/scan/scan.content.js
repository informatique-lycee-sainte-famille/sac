// ./front/public/components/contents/scan/scan.content.js
export async function init() {
  if (window.SACApp?.refreshProfileView) {
    window.SACApp.refreshProfileView();
  }
}
