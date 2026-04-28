export function init() {
  document.querySelector("[data-home-link]")?.addEventListener("click", async () => {
    window.SACComponents?.setScanNavigationEnabled(false);
    await window.SACComponents?.loadContent("home", "#content-slot", {
      app: window.SACApp,
    });
  });
}
