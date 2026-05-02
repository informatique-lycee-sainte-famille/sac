// ./front/public/script.app.js
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.service_worker.js").catch(() => undefined);
    }

    const appState = {
      user: null,
    };
    let deferredInstallPrompt = null;
    const USER_PLACEHOLDER_AVATAR =
      "/resources/ensemble_scolaire_lycee_sainte_famille_saintonge_formation_logo_512x512.png";
    const ADMIN_MEDIA_TRIGGER = [100, 114, 32, 104, 111, 117, 115, 101]
      .map(code => String.fromCharCode(code))
      .join("");
    let adminMediaBuffer = "";
    let networkErrorEscapeListenerAttached = false;

    // Handle network access error modal
    function showNetworkErrorModal() {
      const modal = document.getElementById("network-error-modal");
      if (modal) {
        modal.classList.remove("hidden");
        
        // Unblock page now that modal is visible
        document.documentElement.style.pointerEvents = "auto";
        document.documentElement.style.opacity = "1";
      }
    }

    function handleNetworkErrorEscapeKey(event) {
      if (event.key === "Escape") {
        const modal = document.getElementById("network-error-modal");
        if (modal && !modal.classList.contains("hidden")) {
          closeNetworkErrorModal();
        }
      }
    }


    function closeNetworkErrorModal() {
      const modal = document.getElementById("network-error-modal");
      if (modal) {
        modal.classList.add("hidden");
      }
    }
    
    function showNetworkErrorModalFromApi(blockedIp) {
      // Set the IP address if provided
      if (blockedIp) {
        const ipElement = document.getElementById("network-error-ip");
        if (ipElement) {
          ipElement.textContent = blockedIp;
        }
      }
      
      // Show the modal
      showNetworkErrorModal();
      
      // Setup close button if not already done
      const closeButton = document.getElementById("network-error-close");
      if (closeButton && !closeButton.dataset.networkErrorListenerAttached) {
        closeButton.dataset.networkErrorListenerAttached = "true";
        closeButton.addEventListener("click", closeNetworkErrorModal);
      }
    }
    // Setup Escape key handler
    if (!networkErrorEscapeListenerAttached) {
      window.addEventListener("keydown", handleNetworkErrorEscapeKey);
      networkErrorEscapeListenerAttached = true;
    }

    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      document.getElementById("pwa-install-direct")?.classList.remove("hidden");
    });

    function byId(id) {
      return document.getElementById(id);
    }

    function setText(id, value) {
      const element = byId(id);
      if (element) {
        element.innerText = value;
      }
    }

    function toggleHidden(id, shouldHide) {
      const element = byId(id);
      if (element) {
        element.classList.toggle("hidden", shouldHide);
      }
    }

    function isAdminSectionActive() {
      return appState.user?.role === "admin" && window.location.hash.replace(/^#/, "") === "admin";
    }

    function closeAdminMediaPreview() {
      document.getElementById("admin-media-preview")?.remove();
    }

    function showAdminMediaPreview() {
      closeAdminMediaPreview();

      const modal = document.createElement("div");
      modal.id = "admin-media-preview";
      modal.className = "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4";
      modal.innerHTML = `
        <section class="relative w-full max-w-3xl border border-white/20 bg-neutral-950 p-3 shadow-2xl" role="dialog" aria-modal="true" aria-label="Aperçu média">
          <button type="button" data-admin-media-close class="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black" aria-label="Fermer">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
          <img
            src="/resources/logo3.png"
            alt="Aperçu média"
            class="max-h-[82vh] w-full object-contain"
            data-admin-media-image
          />
          <div data-admin-media-missing class="hidden p-8 text-center text-white">
            <p class="text-lg font-semibold">Aperçu indisponible</p>
            <p class="mt-2 text-sm text-white/70">La ressource demandée n'est pas encore disponible.</p>
          </div>
        </section>
      `;

      modal.addEventListener("click", event => {
        if (event.target === modal || event.target.closest("[data-admin-media-close]")) {
          closeAdminMediaPreview();
        }
      });

      modal.querySelector("[data-admin-media-image]")?.addEventListener("error", event => {
        event.currentTarget.classList.add("hidden");
        modal.querySelector("[data-admin-media-missing]")?.classList.remove("hidden");
      });

      document.body.appendChild(modal);
    }

    function bindAdminMediaShortcut() {
      if (window.__sacAdminMediaShortcutBound) return;
      window.__sacAdminMediaShortcutBound = true;

      window.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closeAdminMediaPreview();
          return;
        }

        if (!isAdminSectionActive() || event.ctrlKey || event.metaKey || event.altKey) {
          adminMediaBuffer = "";
          return;
        }

        if (event.key.length !== 1) return;

        adminMediaBuffer = `${adminMediaBuffer}${event.key.toLowerCase()}`
          .slice(-ADMIN_MEDIA_TRIGGER.length);

        if (adminMediaBuffer === ADMIN_MEDIA_TRIGGER) {
          adminMediaBuffer = "";
          showAdminMediaPreview();
        }
      });
    }

    function setLoginVisible(shouldShow) {
      const loginButton = byId("login-btn");
      if (!loginButton) return;

      loginButton.classList.toggle("hidden", !shouldShow);
      loginButton.classList.toggle("inline-flex", shouldShow);
    }

    function escapeHtml(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function isPwaInstalled() {
      return (
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator.standalone === true ||
        document.referrer.startsWith("android-app://")
      );
    }

    function getInstallHelp() {
      const ua = navigator.userAgent || "";
      const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/i.test(ua);
      const isWindows = /Windows/i.test(ua);
      const isMac = /Macintosh|Mac OS X/i.test(ua);

      if (isIos) {
        return "Sur iPhone/iPad: ouvrez le bouton Partager dans Safari, puis touchez Ajouter à l'écran d'accueil.";
      }
      if (isAndroid) {
        return "Sur Android: ouvrez le menu du navigateur, puis choisissez Installer l'application ou Ajouter à l'écran d'accueil.";
      }
      if (isWindows || isMac) {
        return "Sur ordinateur: utilisez l'icône d'installation dans la barre d'adresse Chrome/Edge, ou le menu du navigateur.";
      }
      return "Installez l'application depuis le menu de votre navigateur pour que les prochains scans NFC s'ouvrent plus naturellement.";
    }

    function showPwaInstallBubble() {
      if (isPwaInstalled() || document.getElementById("pwa-install-bubble")) return;

      const bubble = document.createElement("aside");
      bubble.id = "pwa-install-bubble";
      bubble.className = "fixed right-3 top-3 z-[9997] w-[min(360px,calc(100vw-24px))] border border-[#624292]/30 bg-white p-4 text-neutral-950 shadow-2xl";
      bubble.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#624292] text-white">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">Installation conseillée</p>
            <p class="mt-1 text-sm text-neutral-600">L'usage sera plus simple et fluide si vous installez la PWA.</p>
            <p id="pwa-install-help" class="mt-2 hidden text-xs leading-relaxed text-neutral-500">${escapeHtml(getInstallHelp())}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button id="pwa-install-info" type="button" class="inline-flex items-center gap-2 border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-neutral-50">
                <i class="fa-solid fa-circle-question" aria-hidden="true"></i>
                <span>Comment ?</span>
              </button>
              <button id="pwa-install-direct" type="button" class="${deferredInstallPrompt ? "" : "hidden"} inline-flex items-center gap-2 border border-[#624292] bg-[#624292] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#52357f]">
                <i class="fa-solid fa-download" aria-hidden="true"></i>
                <span>Installer</span>
              </button>
            </div>
          </div>
          <button id="pwa-install-close" type="button" class="text-neutral-400 hover:text-neutral-800" aria-label="Fermer">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      `;
      document.body.appendChild(bubble);

      bubble.querySelector("#pwa-install-info")?.addEventListener("click", () => {
        bubble.querySelector("#pwa-install-help")?.classList.toggle("hidden");
      });
      bubble.querySelector("#pwa-install-close")?.addEventListener("click", () => bubble.remove());
      bubble.querySelector("#pwa-install-direct")?.addEventListener("click", async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice.catch(() => undefined);
        deferredInstallPrompt = null;
        bubble.remove();
      });
    }

    function getCookieConsent() {
      try {
        return JSON.parse(localStorage.getItem("sacCookieConsent") || "null");
      } catch {
        return null;
      }
    }

    function saveCookieConsent(choice) {
      try {
        localStorage.setItem("sacCookieConsent", JSON.stringify({
          choice,
          savedAt: new Date().toISOString(),
          version: 1,
        }));
      } catch {
        return;
      }
    }

    function closeCookieBanner() {
      document.getElementById("cookie-consent-banner")?.remove();
    }

    function showCookieBanner(force = false) {
      if (!force && getCookieConsent()) return;
      if (document.getElementById("cookie-consent-banner")) return;

      const banner = document.createElement("aside");
      banner.id = "cookie-consent-banner";
      banner.className = "fixed inset-x-3 bottom-3 z-[9996] mx-auto w-[min(960px,calc(100vw-24px))] border border-white/20 bg-white text-neutral-950 shadow-2xl";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-live", "polite");
      banner.setAttribute("aria-label", "Information cookies");
      banner.innerHTML = `
        <div class="grid gap-4 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-5">
          <div class="flex h-11 w-11 items-center justify-center rounded-full bg-[#624292] text-white">
            <i class="fa-solid fa-cookie-bite" aria-hidden="true"></i>
          </div>
          <div class="min-w-0">
            <p class="text-base font-semibold">Cookies et sécurité</p>
            <p class="mt-1 text-sm leading-relaxed text-neutral-600">
              SAC utilise uniquement des cookies nécessaires à la connexion, à la sécurité CSRF et au fonctionnement de l'application. Aucun cookie publicitaire ou traceur tiers n'est utilisé.
            </p>
            <a class="mt-2 inline-flex text-sm font-medium text-[#624292] underline-offset-2 hover:underline" href="/cookies.html">Lire la politique cookies</a>
          </div>
          <div class="flex flex-col gap-2 sm:min-w-44">
            <button type="button" data-cookie-accept class="inline-flex items-center justify-center gap-2 border border-[#624292] bg-[#624292] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#52357f]">
              <i class="fa-solid fa-check" aria-hidden="true"></i>
              <span>J'ai compris</span>
            </button>
            <button type="button" data-cookie-necessary class="inline-flex items-center justify-center border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50">
              Nécessaires uniquement
            </button>
          </div>
        </div>
      `;

      banner.querySelector("[data-cookie-accept]")?.addEventListener("click", () => {
        saveCookieConsent("accepted");
        closeCookieBanner();
      });
      banner.querySelector("[data-cookie-necessary]")?.addEventListener("click", () => {
        saveCookieConsent("necessary_only");
        closeCookieBanner();
      });

      document.body.appendChild(banner);
    }

    function getUserAvatarSrc(data) {
      return (
        data?.avatar ||
        data?.o365AvatarB64 ||
        data?.edPhotoB64 ||
        data?.edAvatarUrl ||
        data?.edProfile?.photoUrl ||
        data?.edProfile?.photo ||
        data?.edProfile?.urlPhoto ||
        USER_PLACEHOLDER_AVATAR
      );
    }

    function getEdAvatarSrc(data) {
      return (
        data?.edPhotoB64 ||
        data?.edAvatarUrl ||
        data?.edProfile?.photoUrl ||
        data?.edProfile?.photo ||
        data?.edProfile?.urlPhoto ||
        null
      );
    }

    function closeUserInfoPopup() {
      document.getElementById("user-info-popup")?.remove();
    }

    function userInfoRow(label, value) {
      return `
        <div class="grid grid-cols-1 gap-1 border-t border-neutral-200 py-2 sm:grid-cols-[130px_1fr]">
          <dt class="text-xs font-semibold uppercase text-neutral-500">${escapeHtml(label)}</dt>
          <dd class="break-words text-sm text-neutral-950">${escapeHtml(value || "Non renseigné")}</dd>
        </div>
      `;
    }

    function userPhoto(label, src) {
      const photoContent = src
        ? `<img
            src="${escapeHtml(src)}"
            alt="${escapeHtml(label)}"
            class="h-24 w-24 rounded-full border border-neutral-200 bg-white object-cover"
          />`
        : `<div class="flex h-24 w-24 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 px-3 text-center text-xs font-medium leading-tight text-neutral-500">
            Aucune image fournie
          </div>`;

      return `
        <div class="min-w-0">
          <p class="mb-2 text-xs font-semibold uppercase text-neutral-500">${escapeHtml(label)}</p>
          ${photoContent}
        </div>
      `;
    }

    function openUserInfoPopup() {
      const data = appState.user;
      if (!data) return;

      closeUserInfoPopup();

      const popup = document.createElement("div");
      const photoEd = getEdAvatarSrc(data);
      const edPhotoHtml = data.role === "student" ? userPhoto("Photo ED", photoEd) : "";
      popup.id = "user-info-popup";
      popup.className = "fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4";
      popup.innerHTML = `
        <div class="w-full max-w-lg bg-white p-5 text-neutral-950 shadow-2xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold">Informations utilisateur</h2>
              <p class="mt-1 text-sm text-neutral-500">Résumé du profil connecté</p>
            </div>
            <button
              type="button"
              data-user-info-close
              class="shrink-0 border border-neutral-300 px-3 py-1 text-sm transition hover:bg-neutral-100"
            >
              Fermer
            </button>
          </div>

          <div class="mt-4 flex gap-6">
            ${userPhoto("Photo Office", data.avatar || data.o365AvatarB64)}
            ${edPhotoHtml}
          </div>

          <dl class="mt-4">
            ${userInfoRow("Prénom", data.firstName)}
            ${userInfoRow("Nom", data.lastName)}
            ${userInfoRow("Type", formatRole(data.role))}
            ${userInfoRow("Identifiant", data.id)}
            ${userInfoRow("Mail Office 365", data.o365Email || data.email)}
            ${userInfoRow("Mail EcoleDirecte", data.edEmail)}
          </dl>
        </div>
      `;

      popup.addEventListener("click", event => {
        if (event.target === popup || event.target.closest("[data-user-info-close]")) {
          closeUserInfoPopup();
        }
      });

      document.body.appendChild(popup);
    }

    function bindUserInfoPopup() {
      ["sidebar-user-info", "mobile-user-info"].forEach(id => {
        const element = byId(id);
        if (!element || element.dataset.popupBound === "true") return;

        element.dataset.popupBound = "true";
        element.addEventListener("click", openUserInfoPopup);
      });
    }

    function refreshProfileView() {
      const data = appState.user;
      const profilePanel = byId("profile-panel");
      const avatar = byId("avatar");
      const authSidebars = document.querySelectorAll("[data-auth-sidebar]");
      const sidebarUserInfo = byId("sidebar-user-info");
      const mobileUserInfo = byId("mobile-user-info");
      const studentOnlyLinks = document.querySelectorAll("[data-student-only-link]");
      const courseLinks = document.querySelectorAll("[data-course-link]");
      const staffLinks = document.querySelectorAll("[data-staff-link]");
      const adminLinks = document.querySelectorAll("[data-admin-link]");

      authSidebars.forEach(sidebar => {
        sidebar.classList.toggle("hidden", !data);
      });
      studentOnlyLinks.forEach(link => {
        link.classList.toggle("hidden", data?.role !== "student");
      });
      courseLinks.forEach(link => {
        link.classList.toggle("hidden", !["student", "teacher"].includes(data?.role));
      });
      staffLinks.forEach(link => {
        link.classList.toggle("hidden", !["staff", "admin"].includes(data?.role));
      });
      adminLinks.forEach(link => {
        link.classList.toggle("hidden", data?.role !== "admin");
      });

      if (!data) {
        setText("info", "Not logged in");
        toggleHidden("logout-btn", true);
        toggleHidden("scan-logout-btn", true);
        setLoginVisible(true);
        profilePanel?.classList.add("hidden");
        profilePanel?.classList.remove("flex");
        setText("auth-card-title", "Bienvenue sur Saintonge Access Control");
        setText("auth-card-subtitle", "Votre nouvel outil de gestion d'appel automatisé");
        avatar?.removeAttribute("src");
        avatar?.classList.add("hidden");
        const emptyUserInfoHtml = `
            <img
              id="sidebar-user-avatar"
              src="${USER_PLACEHOLDER_AVATAR}"
              alt="Avatar utilisateur"
              class="mx-auto mb-2 h-14 w-14 rounded-full bg-white object-cover"
            />
            INFOS<br />UTILISATEURS
          `;
        if (sidebarUserInfo) sidebarUserInfo.innerHTML = emptyUserInfoHtml;
        if (mobileUserInfo) {
          mobileUserInfo.innerHTML = `
            <img
              id="mobile-user-avatar"
              src="${USER_PLACEHOLDER_AVATAR}"
              alt="Avatar utilisateur"
              class="h-9 w-9 shrink-0 rounded-full bg-white object-cover"
            />
            <span class="block min-w-0 max-w-full whitespace-normal break-words">INFOS UTILISATEURS</span>
          `;
        }
        bindUserInfoPopup();
        return;
      }

      setText("info", JSON.stringify(data, null, 2));
      toggleHidden("logout-btn", false);
      toggleHidden("scan-logout-btn", true);
      setLoginVisible(false);
      profilePanel?.classList.add("hidden");
      profilePanel?.classList.remove("flex");
      setText("auth-card-title", "Bienvenue sur Saintonge Access Control");
      setText("auth-card-subtitle", "Votre nouvel outil de gestion d'appel automatisé");
      setText(
        "profile-name",
        `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || "Utilisateur"
      );
      setText("profile-role", formatRole(data.role));
      if (sidebarUserInfo) {
        const displayName =
          `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email || "Utilisateur";
        const className = data.class?.name || data.class?.code || "";
        const classHtml = data.role === "student"
          ? `<span class="mt-2 block max-w-full whitespace-normal break-words border-t border-neutral-300 pt-2 text-xs normal-case leading-tight text-neutral-700">${escapeHtml(className || "Classe non renseignée")}</span>`
          : "";
        const userInfoHtml = `
          <img
            id="sidebar-user-avatar"
            src="${escapeHtml(getUserAvatarSrc(data))}"
            alt="Avatar utilisateur"
            class="mx-auto mb-2 h-14 w-14 rounded-full bg-white object-cover"
          />
          <span class="block max-w-full whitespace-normal break-words text-sm font-semibold normal-case leading-tight">${escapeHtml(displayName)}</span>
          <span class="mt-1 block max-w-full whitespace-normal break-words text-xs normal-case leading-tight text-neutral-700">${escapeHtml(formatRole(data.role))}</span>
          ${classHtml}
        `;
        sidebarUserInfo.innerHTML = userInfoHtml;
        if (mobileUserInfo) {
          const classLine = data.role === "student" && className
            ? `<span class="block max-w-full whitespace-normal break-words text-[11px] normal-case leading-tight text-neutral-600">${escapeHtml(className)}</span>`
            : "";
          mobileUserInfo.innerHTML = `
            <img
              id="mobile-user-avatar"
              src="${escapeHtml(getUserAvatarSrc(data))}"
              alt="Avatar utilisateur"
              class="h-9 w-9 shrink-0 rounded-full bg-white object-cover"
            />
            <span class="block min-w-0 max-w-full">
              <span class="block max-w-full whitespace-normal break-words text-xs font-semibold normal-case leading-tight">${escapeHtml(displayName)}</span>
              <span class="block max-w-full whitespace-normal break-words text-[11px] normal-case leading-tight text-neutral-700">${escapeHtml(formatRole(data.role))}</span>
              ${classLine}
            </span>
          `;
        }
        bindUserInfoPopup();
      }

      if (avatar) {
        avatar.src = getUserAvatarSrc(data);
        avatar.classList.remove("hidden");
      }
    }

    async function loadAuthenticatedSidebar() {
      const sidebarSlot = byId("sidebar-slot");
      if (!sidebarSlot || sidebarSlot.dataset.loaded === "true") return;

      await window.SACComponents.loadComponent("sidebar", "#sidebar-slot", {
        app: window.SACApp,
      });

      sidebarSlot.dataset.loaded = "true";
      refreshProfileView();
      window.SACComponents.refreshActiveNavigation();
    }
    function formatRole(role) {
      const roles = {
        student: "Élève",
        teacher: "Enseignant",
        staff: "Personnel",
        admin: "Administrateur",
      };

      return roles[role] || "Utilisateur";
    }

    async function loadProfile() {
      try {
        const res = await fetch("/api/user/me");
        const data = await res.json();
        
        // Check if blocked by network filter (returns 403 with error code)
        if (!res.ok && res.status === 403 && data.code === "NETWORK_ACCESS_BLOCKED") {
          // Show network error modal with blocked IP
          showNetworkErrorModalFromApi(data.blockedIp);
          appState.user = null;
          refreshProfileView();
          return null;
        }
        
        if (!res.ok) throw new Error("Not logged in");
        appState.user = data;
        refreshProfileView();
        return data;
      } catch (err) {
        appState.user = null;
        refreshProfileView();
        return null;
      }
    }

    function setNfcResult(message, type = "info") {
      const result = document.getElementById("nfc-result");
      const colors = {
        info: "#ffffff",
        success: "#bbf7d0",
        error: "#fecaca",
      };

      if (result) {
        result.style.color = colors[type] || colors.info;
        result.innerText = message || "";
      }

      showNfcResultModal(message, type);
    }

    function closeNfcResultModal() {
      const modal = document.getElementById("nfc-result-modal");
      if (!modal) return;

      modal.classList.add("hidden");
      modal.classList.remove("flex");
      modal.setAttribute("aria-hidden", "true");
    }

    function showNfcResultModal(message, type = "info") {
      const modal = document.getElementById("nfc-result-modal");
      const box = document.getElementById("nfc-result-box");
      const icon = document.getElementById("nfc-result-icon");
      const iconSymbol = icon?.querySelector("i");
      const title = document.getElementById("nfc-result-title");
      const text = document.getElementById("nfc-result-message");
      const closeButton = document.getElementById("nfc-result-close");

      if (!modal || !box || !icon || !title || !text || !closeButton) return;

      const variants = {
        info: {
          title: "Traitement en cours",
          box: "border-white bg-white text-neutral-950",
          icon: "bg-[#624292] text-white",
          symbol: "fa-solid fa-spinner fa-spin",
          button: "hidden",
        },
        success: {
          title: "Validation réussie",
          box: "border-emerald-300 bg-emerald-50 text-emerald-950",
          icon: "bg-emerald-600 text-white",
          symbol: "fa-solid fa-circle-check",
          button: "inline-flex border-emerald-800 bg-emerald-800 hover:bg-emerald-900 focus:ring-emerald-300",
        },
        error: {
          title: "Validation refusée",
          box: "border-red-300 bg-red-50 text-red-950",
          icon: "bg-red-700 text-white",
          symbol: "fa-solid fa-circle-xmark",
          button: "inline-flex border-red-800 bg-red-800 hover:bg-red-900 focus:ring-red-300",
        },
      };
      const variant = variants[type] || variants.info;

      box.className = `w-full max-w-2xl border-4 p-6 text-center shadow-2xl sm:p-10 ${variant.box}`;
      icon.className = `mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl sm:h-24 sm:w-24 sm:text-5xl ${variant.icon}`;
      if (iconSymbol) iconSymbol.className = variant.symbol;
      title.innerText = variant.title;
      text.innerText = message || "";
      closeButton.className = `mt-8 items-center justify-center px-6 py-3 text-base font-semibold text-white transition focus:outline-none focus:ring-4 ${variant.button}`;
      closeButton.classList.toggle("hidden", type === "info");

      if (closeButton.dataset.bound !== "true") {
        closeButton.dataset.bound = "true";
        closeButton.addEventListener("click", closeNfcResultModal);
      }

      modal.classList.remove("hidden");
      modal.classList.add("flex");
      modal.setAttribute("aria-hidden", "false");
    }

    function getNfcFromUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("nfc");
    }

    function hasPendingNfc() {
      return Boolean(getNfcFromUrl() || sessionStorage.getItem("pendingNfcUid"));
    }

    function cleanNfcFromUrl() {
      const url = new URL(window.location.href);
      url.searchParams.delete("nfc");

      const cleanPath =
        url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
        url.hash;

      window.history.replaceState({}, "", cleanPath || "/");
    }

    function shouldIgnoreAdminNfcScan(user, nfcUid) {
      if (user?.role !== "admin" || !nfcUid) return false;

      try {
        const rawState = sessionStorage.getItem("sacAdminNfcIgnore") || localStorage.getItem("sacAdminNfcIgnore");
        if (!rawState) return false;

        const state = JSON.parse(rawState);
        const expiresAt = Number(state.expiresAt || 0);
        if (!expiresAt || Date.now() > expiresAt) {
          sessionStorage.removeItem("sacAdminNfcIgnore");
          localStorage.removeItem("sacAdminNfcIgnore");
          return false;
        }

        return !state.nfcUid || String(state.nfcUid) === String(nfcUid);
      } catch (error) {
        sessionStorage.removeItem("sacAdminNfcIgnore");
        localStorage.removeItem("sacAdminNfcIgnore");
        return false;
      }
    }

    async function neutralizeAdminNfcScan(nfcUid) {
      sessionStorage.removeItem("pendingNfcUid");
      sessionStorage.setItem("sacAdminOpenNfcCards", "1");
      cleanNfcFromUrl();

      await window.SACComponents?.loadContent("admin", "#content-slot", {
        app: window.SACApp,
        updateHash: true,
      });

      window.dispatchEvent(new CustomEvent("sac:admin-nfc-neutralized", {
        detail: { nfcUid },
      }));
    }

    function captureSignature() {
      return new Promise((resolve, reject) => {
        const modal = document.getElementById("signature-modal");
        const canvas = document.getElementById("signature-canvas");
        const clearBtn = document.getElementById("signature-clear");
        const cancelBtn = document.getElementById("signature-cancel");
        const submitBtn = document.getElementById("signature-submit");
        let signaturePad = null;

        if (!modal || !canvas || !clearBtn || !cancelBtn || !submitBtn) {
          reject(new Error("Le module de signature n'est pas chargé."));
          return;
        }

        function resizeCanvas() {
          const ratio = Math.max(window.devicePixelRatio || 1, 1);
          const rect = canvas.getBoundingClientRect();
          canvas.width = Math.floor(rect.width * ratio);
          canvas.height = Math.floor(rect.height * ratio);
          canvas.getContext("2d").scale(ratio, ratio);
          signaturePad.clear();
        }

        function close() {
          modal.classList.remove("open");
          modal.setAttribute("aria-hidden", "true");
          window.removeEventListener("resize", resizeCanvas);
          clearBtn.removeEventListener("click", clear);
          cancelBtn.removeEventListener("click", cancel);
          submitBtn.removeEventListener("click", submit);
        }

        function clear() {
          signaturePad.clear();
        }

        function cancel() {
          close();
          reject(new Error("Signature annulée."));
        }

        function submit() {
          if (signaturePad.isEmpty()) {
            setNfcResult("La signature est obligatoire.", "error");
            return;
          }

          const signature = signaturePad.toDataURL("image/png");
          close();
          resolve(signature);
        }

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        signaturePad = new SignaturePad(canvas, {
          backgroundColor: "rgb(255,255,255)",
        });
        resizeCanvas();

        window.addEventListener("resize", resizeCanvas);
        clearBtn.addEventListener("click", clear);
        cancelBtn.addEventListener("click", cancel);
        submitBtn.addEventListener("click", submit);
      });
    }

    async function callNfcApi(path, body) {
      const deviceFingerprint = await getDeviceFingerprint();
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-fingerprint": deviceFingerprint,
          "x-csrf-token": getCookie("XSRF-TOKEN"),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || data.error || "Scan NFC refusé");
      }

      return data;
    }

    function getCookie(name) {
      return document.cookie
        .split(";")
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith(`${name}=`))
        ?.slice(name.length + 1) || "";
    }

    async function getDeviceFingerprint() {
      const components = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        languages: navigator.languages || [navigator.language],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: {
          width: window.screen?.width,
          height: window.screen?.height,
          availWidth: window.screen?.availWidth,
          availHeight: window.screen?.availHeight,
          colorDepth: window.screen?.colorDepth,
          pixelDepth: window.screen?.pixelDepth,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        hardwareConcurrency: navigator.hardwareConcurrency || null,
        deviceMemory: navigator.deviceMemory || null,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        plugins: Array.from(navigator.plugins || []).map(plugin => plugin.name).sort(),
        mimeTypes: Array.from(navigator.mimeTypes || []).map(mimeType => mimeType.type).sort(),
        fonts: detectInstalledFonts(),
        canvas: getCanvasSignal(),
      };

      return sha256(JSON.stringify(components));
    }

    function detectInstalledFonts() {
      const candidates = [
        "Arial", "Arial Black", "Calibri", "Cambria", "Candara", "Comic Sans MS",
        "Consolas", "Courier New", "Georgia", "Helvetica", "Impact", "Lucida Console",
        "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana",
        "Roboto", "Open Sans", "Inter", "Noto Sans", "SF Pro Text",
      ];
      const baseFonts = ["monospace", "sans-serif", "serif"];
      const testText = "mmmmmmmmmmlli";
      const testSize = "72px";
      const container = document.createElement("div");
      const baseline = {};

      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "-9999px";
      container.style.fontSize = testSize;
      container.style.visibility = "hidden";
      document.body.appendChild(container);

      for (const baseFont of baseFonts) {
        const span = document.createElement("span");
        span.style.fontFamily = baseFont;
        span.textContent = testText;
        container.appendChild(span);
        baseline[baseFont] = `${span.offsetWidth}x${span.offsetHeight}`;
      }

      const detected = candidates.filter(font => {
        return baseFonts.some(baseFont => {
          const span = document.createElement("span");
          span.style.fontFamily = `"${font}", ${baseFont}`;
          span.textContent = testText;
          container.appendChild(span);
          const size = `${span.offsetWidth}x${span.offsetHeight}`;
          return size !== baseline[baseFont];
        });
      });

      container.remove();
      return detected.sort();
    }

    function getCanvasSignal() {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const year = new Date().getFullYear();
      if (!ctx) return null;

      canvas.width = 280;
      canvas.height = 80;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 120, 36);
      ctx.fillStyle = "#069";
      ctx.font = "18px Arial";
      ctx.fillText(`SAC attendance ${year}`, 8, 8);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.font = "16px Times New Roman";
      ctx.fillText("signature+nfc", 12, 42);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "rgb(255,0,255)";
      ctx.beginPath();
      ctx.arc(210, 35, 24, 0, Math.PI * 2);
      ctx.fill();

      return canvas.toDataURL();
    }

    async function sha256(value) {
      if (window.crypto?.subtle) {
        const data = new TextEncoder().encode(value);
        const hash = await window.crypto.subtle.digest("SHA-256", data);
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      }

      let hash = 0;
      for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
      }

      return `fallback-${Math.abs(hash).toString(16)}`;
    }

    async function prepareNfc(nfcUid) {
      setNfcResult("Vérification du badge NFC...", "info");
      return callNfcApi("/api/nfc/scan/prepare", { nfcUid });
    }

    async function sendNfc(nfcUid, signature) {
      setNfcResult("Traitement du badge NFC...", "info");
      return callNfcApi("/api/nfc/scan", { nfcUid, signature });
    }

    function confirmScanContext(summary) {
      return new Promise(resolve => {
        document.getElementById("scan-context-confirm-modal")?.remove();
        const modal = document.createElement("div");

        modal.id = "scan-context-confirm-modal";
        modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4";
        modal.innerHTML = `
          <section class="w-full max-w-xl border border-white/20 bg-white text-neutral-950 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="scan-context-confirm-title">
            <div class="bg-[#624292] px-5 py-4 text-white">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-white/75">Confirmation salle</p>
                  <h2 id="scan-context-confirm-title" class="mt-1 text-2xl font-semibold">Valider ce cours ?</h2>
                </div>
                <button type="button" data-scan-context-cancel class="text-white/80 hover:text-white" aria-label="Annuler">
                  <i class="fa-solid fa-xmark text-xl" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="p-5">
              <p class="text-sm text-neutral-600">Vérifie que la salle, la classe et le cours correspondent bien avant de signer.</p>
              <div class="mt-5 grid gap-3 sm:grid-cols-2">
                <div class="border border-neutral-200 bg-neutral-50 p-3">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Salle</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.roomName || summary.room || "Non renseignée")}</p>
                </div>
                <div class="border border-neutral-200 bg-neutral-50 p-3">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Classe</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.className || "Non renseignée")}</p>
                </div>
                <div class="border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Cours</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.courseLabel || "Cours")}</p>
                </div>
              </div>
              <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" data-scan-context-cancel class="inline-flex justify-center border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">
                  Annuler
                </button>
                <button type="button" data-scan-context-confirm class="inline-flex items-center justify-center gap-2 border border-[#624292] bg-[#624292] px-4 py-2 text-sm font-semibold text-white hover:bg-[#52357f]">
                  <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
                  <span>Confirmer et signer</span>
                </button>
              </div>
            </div>
          </section>
        `;

        const finish = value => {
          modal.remove();
          resolve(value);
        };

        modal.querySelectorAll("[data-scan-context-cancel]").forEach(button => {
          button.addEventListener("click", () => finish(false));
        });
        modal.querySelector("[data-scan-context-confirm]")?.addEventListener("click", () => finish(true));
        modal.addEventListener("click", event => {
          if (event.target === modal) finish(false);
        });
        document.body.appendChild(modal);
      });
    }

    function confirmFinalizeAttendance(summary) {
      return new Promise(resolve => {
        document.getElementById("finalize-confirm-modal")?.remove();
        const modal = document.createElement("div");
        const total = Number(summary.totalStudents || 0);
        const present = Number(summary.presentCount || 0);
        const percent = total > 0 ? Math.round((present / total) * 100) : 0;

        modal.id = "finalize-confirm-modal";
        modal.className = "fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4";
        modal.innerHTML = `
          <section class="w-full max-w-xl border border-white/20 bg-white text-neutral-950 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="finalize-confirm-title">
            <div class="bg-[#624292] px-5 py-4 text-white">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-white/75">Validation définitive</p>
                  <h2 id="finalize-confirm-title" class="mt-1 text-2xl font-semibold">Envoyer l'appel</h2>
                </div>
                <button type="button" data-finalize-cancel class="text-white/80 hover:text-white" aria-label="Annuler">
                  <i class="fa-solid fa-xmark text-xl" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="p-5">
              <p class="text-sm text-neutral-600">Cette action valide la session, envoie l'appel à EcoleDirecte, génère le PDF et déclenche l'envoi mail prévu.</p>
              <div class="mt-5 grid gap-3 sm:grid-cols-2">
                <div class="border border-neutral-200 bg-neutral-50 p-3">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Classe</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.className || "Non renseignée")}</p>
                </div>
                <div class="border border-neutral-200 bg-neutral-50 p-3">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Horaire</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.horaire || "Non renseigné")}</p>
                </div>
                <div class="border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
                  <p class="text-xs font-semibold uppercase text-neutral-500">Cours</p>
                  <p class="mt-1 break-words text-base font-semibold">${escapeHtml(summary.courseLabel || "Cours")}</p>
                </div>
              </div>
              <div class="mt-5 grid gap-3 sm:grid-cols-3">
                <div class="border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                  <p class="text-xs font-semibold uppercase">Présents</p>
                  <p class="mt-1 text-2xl font-bold">${escapeHtml(present)}/${escapeHtml(total)}</p>
                </div>
                <div class="border border-red-200 bg-red-50 p-3 text-red-900">
                  <p class="text-xs font-semibold uppercase">Absents</p>
                  <p class="mt-1 text-2xl font-bold">${escapeHtml(summary.absentCount || 0)}</p>
                </div>
                <div class="border border-[#624292]/20 bg-[#624292]/10 p-3 text-[#43236f]">
                  <p class="text-xs font-semibold uppercase">Présence</p>
                  <p class="mt-1 text-2xl font-bold">${escapeHtml(percent)}%</p>
                </div>
              </div>
              <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" data-finalize-cancel class="inline-flex justify-center border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50">
                  Annuler
                </button>
                <button type="button" data-finalize-confirm class="inline-flex items-center justify-center gap-2 border border-[#624292] bg-[#624292] px-4 py-2 text-sm font-semibold text-white hover:bg-[#52357f]">
                  <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
                  <span>Valider et envoyer</span>
                </button>
              </div>
            </div>
          </section>
        `;

        const finish = value => {
          modal.remove();
          resolve(value);
        };

        modal.querySelectorAll("[data-finalize-cancel]").forEach(button => {
          button.addEventListener("click", () => finish(false));
        });
        modal.querySelector("[data-finalize-confirm]")?.addEventListener("click", () => finish(true));
        modal.addEventListener("click", event => {
          if (event.target === modal) finish(false);
        });
        document.body.appendChild(modal);
      });
    }

    async function finalizeNfc(nfcUid) {
      setNfcResult("Préparation de la validation finale...", "info");
      const summary = await callNfcApi("/api/nfc/scan/finalize/prepare", { nfcUid });

      closeNfcResultModal();
      const confirmed = await confirmFinalizeAttendance(summary);

      if (!confirmed) {
        return { cancelled: true, message: "Validation finale annulée." };
      }

      setNfcResult("Envoi de l'appel et génération du PDF...", "info");
      return callNfcApi("/api/nfc/scan/finalize", { sessionId: summary.sessionId });
    }

    async function processPendingNfc(user) {
      const nfcFromUrl = getNfcFromUrl();
      const pendingNfc = nfcFromUrl || sessionStorage.getItem("pendingNfcUid");

      if (!pendingNfc) return;

      if (nfcFromUrl && shouldIgnoreAdminNfcScan(user, pendingNfc)) {
        await neutralizeAdminNfcScan(pendingNfc);
        return;
      }

      showPwaInstallBubble();
      window.SACComponents?.setScanNavigationEnabled(true);
      await window.SACComponents?.loadContent("scan", "#content-slot", {
        app: window.SACApp,
        allowScan: true,
      });
      sessionStorage.setItem("pendingNfcUid", pendingNfc);

      if (nfcFromUrl) {
        cleanNfcFromUrl();
      }

      if (!user) {
        setNfcResult("Connexion requise pour valider la présence...", "info");
        window.location.href = "/api/o365/login";
        return;
      }

      try {
        const prepareResult = await prepareNfc(pendingNfc);
        if (prepareResult.canFinalize) {
          const result = await finalizeNfc(pendingNfc);
          sessionStorage.removeItem("pendingNfcUid");
          setNfcResult(result.message || "Validation finale terminée.", result.cancelled ? "info" : "success");
          return;
        }

        const needsSignature = ["student", "teacher"].includes(prepareResult.role);
        if (needsSignature) {
          closeNfcResultModal();
          const confirmedScanContext = await confirmScanContext(prepareResult);
          if (!confirmedScanContext) {
            sessionStorage.removeItem("pendingNfcUid");
            setNfcResult("Validation annulée.", "info");
            return;
          }
        }
        const signature = needsSignature ? await captureSignature() : null;
        const result = await sendNfc(pendingNfc, signature);
        sessionStorage.removeItem("pendingNfcUid");
        setNfcResult(result.message || "Présence validée.", "success");
      } catch (err) {
        sessionStorage.removeItem("pendingNfcUid");
        setNfcResult(err.message, "error");
      }
    }

    async function init() {
      bindAdminMediaShortcut();
      showCookieBanner();

      window.SACApp = {
        get user() {
          return appState.user;
        },
        loadProfile,
        refreshProfileView,
        setNfcResult,
        processPendingNfc,
      };

      if (window.SACComponents?.compose) {
        await window.SACComponents.compose({
          app: window.SACApp,
          initialContent: hasPendingNfc() ? "scan" : "home",
        });
      }

      const user = await loadProfile();
      if (user) {
        await loadAuthenticatedSidebar();
        let initialContent = hasPendingNfc()
          ? "scan"
          : window.SACComponents.getContentFromHash("home");

        if (initialContent === "my-class" && user.role !== "student") {
          initialContent = "home";
        }

        if (initialContent === "my-courses" && !["student", "teacher"].includes(user.role)) {
          initialContent = "home";
        }

        if (["staff-courses", "staff-classes", "staff-teachers", "business-logs"].includes(initialContent) && !["staff", "admin"].includes(user.role)) {
          initialContent = "home";
        }

        if (initialContent === "admin" && user.role !== "admin") {
          initialContent = "home";
        }

        if (initialContent === "scan") {
          window.SACComponents.setScanNavigationEnabled(true);
        }

        await window.SACComponents.loadContent(initialContent, "#content-slot", {
          app: window.SACApp,
          allowScan: initialContent === "scan" && hasPendingNfc(),
          updateHash: true,
        });
      }

      await processPendingNfc(user);
    }

    window.addEventListener("DOMContentLoaded", init);
