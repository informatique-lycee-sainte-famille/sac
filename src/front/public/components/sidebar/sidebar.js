export function init() {
  document.querySelectorAll("[data-content-target]").forEach(button => {
    button.addEventListener("click", async () => {
      const contentName = button.dataset.contentTarget;
      if (contentName === "my-class" && window.SACApp?.user?.role !== "student") {
        await window.SACComponents.loadContent("home", "#content-slot", {
          app: window.SACApp,
        });
        return;
      }

      if (contentName === "my-courses" && !["student", "teacher"].includes(window.SACApp?.user?.role)) {
        await window.SACComponents.loadContent("home", "#content-slot", {
          app: window.SACApp,
        });
        return;
      }

      if (contentName === "staff-courses" && !["staff", "admin"].includes(window.SACApp?.user?.role)) {
        await window.SACComponents.loadContent("home", "#content-slot", {
          app: window.SACApp,
        });
        return;
      }

      if (contentName === "admin" && window.SACApp?.user?.role !== "admin") {
        await window.SACComponents.loadContent("home", "#content-slot", {
          app: window.SACApp,
        });
        return;
      }

      if (contentName !== "scan") {
        window.SACComponents.setScanNavigationEnabled(false);
      }

      await window.SACComponents.loadContent(contentName, "#content-slot", {
        app: window.SACApp,
        allowScan: contentName === "scan",
      });
    });
  });
}
