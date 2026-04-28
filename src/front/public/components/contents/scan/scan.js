export async function init() {
  if (window.SACApp?.refreshProfileView) {
    window.SACApp.refreshProfileView();
  }
}
