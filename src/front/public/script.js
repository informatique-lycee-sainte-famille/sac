    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }

    // window.addEventListener("DOMContentLoaded", () => {
    //   ensurePWAUsage();
    // });
    const appState = {
      user: null,
    };
    const USER_PLACEHOLDER_AVATAR =
      "/ressources/ensemble_scolaire_lyce_sainte_famille_saintonge_formation_logo_512x512.png";

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

    function getUserAvatarSrc(data) {
      return (
        data?.avatar ||
        data?.o365AvatarB64 ||
        data?.edPhotoUrl ||
        data?.edAvatarUrl ||
        data?.edProfile?.photoUrl ||
        data?.edProfile?.photo ||
        data?.edProfile?.urlPhoto ||
        USER_PLACEHOLDER_AVATAR
      );
    }

    function refreshProfileView() {
      const data = appState.user;
      const profilePanel = byId("profile-panel");
      const avatar = byId("avatar");
      const authSidebars = document.querySelectorAll("[data-auth-sidebar]");
      const sidebarUserInfo = byId("sidebar-user-info");
      const studentOnlyLinks = document.querySelectorAll("[data-student-only-link]");

      authSidebars.forEach(sidebar => {
        sidebar.classList.toggle("hidden", !data);
      });
      studentOnlyLinks.forEach(link => {
        link.classList.toggle("hidden", data?.role !== "student");
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
        if (sidebarUserInfo) {
          sidebarUserInfo.innerHTML = `
            <img
              id="sidebar-user-avatar"
              src="${USER_PLACEHOLDER_AVATAR}"
              alt="Avatar utilisateur"
              class="mx-auto mb-2 h-14 w-14 rounded-full bg-white object-cover"
            />
            INFOS<br />UTILISATEURS
          `;
        }
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
          ? `<span class="mt-2 block max-w-full whitespace-normal break-words border-t border-neutral-300 pt-2 text-xs normal-case leading-tight text-neutral-700">${escapeHtml(className || "Classe non renseignee")}</span>`
          : "";
        sidebarUserInfo.innerHTML = `
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
        if (!res.ok) throw new Error("Not logged in");
        const data = await res.json();
        appState.user = data;
        refreshProfileView();
        return data;
      } catch {
        appState.user = null;
        refreshProfileView();
        return null;
      }
    }

    function setNfcResult(message, type = "info") {
      const result = document.getElementById("nfc-result");
      if (!result) return;
      const colors = {
        info: "#ffffff",
        success: "#bbf7d0",
        error: "#fecaca",
      };

      result.style.color = colors[type] || colors.info;
      result.innerText = message || "";
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

    function captureSignature() {
      return new Promise((resolve, reject) => {
        const modal = document.getElementById("signature-modal");
        const canvas = document.getElementById("signature-canvas");
        const clearBtn = document.getElementById("signature-clear");
        const cancelBtn = document.getElementById("signature-cancel");
        const submitBtn = document.getElementById("signature-submit");
        let signaturePad = null;

        if (!modal || !canvas || !clearBtn || !cancelBtn || !submitBtn) {
          reject(new Error("Le module de signature n'est pas charge."));
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
          reject(new Error("Signature annulee."));
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
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || data.error || "Scan NFC refuse");
      }

      return data;
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
      if (!ctx) return null;

      canvas.width = 280;
      canvas.height = 80;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f60";
      ctx.fillRect(0, 0, 120, 36);
      ctx.fillStyle = "#069";
      ctx.font = "18px Arial";
      ctx.fillText("SAC attendance 2026", 8, 8);
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
      setNfcResult("Verification du badge NFC...", "info");
      return callNfcApi("/api/nfc/scan/prepare", { nfcUid });
    }

    async function sendNfc(nfcUid, signature) {
      setNfcResult("Traitement du badge NFC...", "info");
      return callNfcApi("/api/nfc/scan", { nfcUid, signature });
    }

    async function finalizeNfc(nfcUid) {
      setNfcResult("Preparation de la validation finale...", "info");
      const summary = await callNfcApi("/api/nfc/scan/finalize/prepare", { nfcUid });

      const confirmed = window.confirm(
        `Envoyer l'appel a EcoleDirecte ?\n\n` +
        `Classe: ${summary.className}\n` +
        `Cours: ${summary.courseLabel || "N/A"}\n` +
        `Horaire: ${summary.horaire}\n` +
        `Presents: ${summary.presentCount}/${summary.totalStudents}\n` +
        `Absents: ${summary.absentCount}`
      );

      if (!confirmed) {
        return { message: "Validation finale annulee." };
      }

      setNfcResult("Envoi de l'appel et generation du PDF...", "info");
      return callNfcApi("/api/nfc/scan/finalize", { sessionId: summary.sessionId });
    }

    async function processPendingNfc(user) {
      const nfcFromUrl = getNfcFromUrl();
      const pendingNfc = nfcFromUrl || sessionStorage.getItem("pendingNfcUid");

      if (!pendingNfc) return;

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
        setNfcResult("Connexion requise pour valider la presence...", "info");
        window.location.href = "/api/o365/login";
        return;
      }

      try {
        const prepareResult = await prepareNfc(pendingNfc);
        if (prepareResult.canFinalize) {
          const result = await finalizeNfc(pendingNfc);
          sessionStorage.removeItem("pendingNfcUid");
          setNfcResult(result.message || "Validation finale terminee.", "success");
          return;
        }

        const needsSignature = ["student", "teacher"].includes(prepareResult.role);
        const signature = needsSignature ? await captureSignature() : null;
        const result = await sendNfc(pendingNfc, signature);
        sessionStorage.removeItem("pendingNfcUid");
        setNfcResult(result.message || "Presence validee.", "success");
      } catch (err) {
        sessionStorage.removeItem("pendingNfcUid");
        setNfcResult(err.message, "error");
      }
    }

    async function init() {
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

    function ensurePWAUsage() {
  console.log("=== ensurePWAUsage() START ===");

  let installPrompt = null;

  // ------------------------------
  //   DETECT INSTALLED STATE
  // ------------------------------
  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://");

  const isIOS =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isSafari = /^((?!chrome|crios|fxios|edg|opr).)*safari/i.test(
    navigator.userAgent
  );

  console.log("User Agent:", navigator.userAgent);
  console.log("isInstalled:", isInstalled());
  console.log("isIOS:", isIOS);
  console.log("isSafari:", isSafari);

  // ------------------------------------------------------
  //   ANDROID/DESKTOP MODAL (always show if not installed)
  // ------------------------------------------------------
  const installModal = document.createElement("div");
  installModal.id = "pwa-install-modal";
  installModal.className =
    "hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4";

  installModal.innerHTML = `
    <div class="bg-gray-900 text-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-6">
      <h2 class="text-2xl font-bold">Installer l’application</h2>
      <p class="text-gray-300">Ajoutez “SAC” pour un accès simplifié.</p>

      <button id="pwa-install-btn"
        class="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold shadow hidden">
        Installer
      </button>

      <button id="pwa-install-close"
        class="w-full py-2 text-gray-400 hover:text-gray-200 text-sm">
        Fermer
      </button>
    </div>
  `;
  document.body.appendChild(installModal);

  const installBtn = installModal.querySelector("#pwa-install-btn");
  const installClose = installModal.querySelector("#pwa-install-close");

  // ------------------------------------------------------
  //   iOS MODAL
  // ------------------------------------------------------
  const iosModal = document.createElement("div");
  iosModal.id = "pwa-ios-modal";
  iosModal.className =
    "hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4";

  iosModal.innerHTML = `
    <div class="bg-gray-900 text-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-6">
      <h2 class="text-2xl font-bold">Installer sur iPhone / iPad</h2>

      <p class="text-gray-300">Pour installer l’application :</p>
      <ul class="text-gray-300 space-y-2 text-sm">
        <li>• Appuyez sur <b>Partager</b> en bas de l’écran</li>
        <li>• Sélectionnez <b>“Ajouter à l’écran d’accueil”</b></li>
      </ul>

      <img src="https://www.cdc.gov/niosh/media/images/2024/10/pwa_ios.png"
           class="mx-auto w-40 opacity-90 rounded-lg">

      <button id="pwa-ios-close"
        class="w-full py-2 text-gray-400 hover:text-gray-200 text-sm">
        Fermer
      </button>
    </div>
  `;
  document.body.appendChild(iosModal);

  const iosClose = iosModal.querySelector("#pwa-ios-close");

  // ------------------------------------------------------
  //   BEFOREINSTALLPROMPT (Chrome/Edge only)
  // ------------------------------------------------------
  window.addEventListener("beforeinstallprompt", (e) => {
    console.log(">>> beforeinstallprompt fired!");
    e.preventDefault();
    installPrompt = e;

    // Enable the Install button ONLY now
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!installPrompt) {
      console.log("Cannot install: installPrompt is null.");
      return;
    }

    const result = await installPrompt.prompt();
    console.log("Install result:", result);
    installPrompt = null;
  });

  installClose.addEventListener("click", () => {
    installModal.classList.add("hidden");
  });

  // ------------------------------------------------------
  //   ALWAYS SHOW POPUP IF NOT INSTALLED
  // ------------------------------------------------------
  if (!isInstalled()) {
    if (isIOS && isSafari) {
      console.log("Showing iOS popup");
      iosModal.classList.remove("hidden");
    } else {
      console.log("Showing Android/Desktop popup (even without beforeinstallprompt)");
      installModal.classList.remove("hidden");
    }
  }

  iosClose.addEventListener("click", () => {
    iosModal.classList.add("hidden");
  });

  console.log("=== ensurePWAUsage() END ===");
}

const currentYear = document.getElementById("current-year");
if (currentYear) {
  currentYear.innerText = new Date().getFullYear();
}

