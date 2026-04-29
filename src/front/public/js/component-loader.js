(function () {
  const loadedStyles = new Set();
  const moduleCache = new Map();
  const contentNames = new Set(["home", "scan", "my-courses", "my-class", "staff-courses", "admin"]);
  let activeContent = null;
  let scanNavigationEnabled = false;

  const slots = {
    header: "#header-slot",
    footer: "#footer-slot",
  };

  function resolveTarget(target) {
    return typeof target === "string" ? document.querySelector(target) : target;
  }

  async function resourceExists(url) {
    const response = await fetch(url, { method: "HEAD" }).catch(() => null);
    return Boolean(response?.ok);
  }

  async function loadStyle(url) {
    if (loadedStyles.has(url) || !(await resourceExists(url))) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
    loadedStyles.add(url);
  }

  async function loadModule(url, context) {
    if (!(await resourceExists(url))) return null;

    if (!moduleCache.has(url)) {
      moduleCache.set(url, import(`${url}?v=${Date.now()}`));
    }

    const module = await moduleCache.get(url);
    if (typeof module.init === "function") {
      await module.init(context);
    }

    return module;
  }

  async function loadFragment({ basePath, target, context = {} }) {
    const host = resolveTarget(target);
    if (!host) {
      throw new Error(`Component target not found: ${target}`);
    }

    const htmlUrl = `${basePath}.html`;
    const response = await fetch(htmlUrl);
    if (!response.ok) {
      throw new Error(`Component not found: ${htmlUrl}`);
    }

    host.innerHTML = await response.text();
    await loadModule(`${basePath}.js`, { ...context, target: host });
    return host;
  }

  async function loadComponent(name, target, context = {}) {
    return loadFragment({
      basePath: `/components/${name}/${name}`,
      target,
      context: { ...context, name, type: "component" },
    });
  }

  function getContentFromHash(fallback = "home") {
    const hashContent = window.location.hash.replace(/^#/, "");
    return contentNames.has(hashContent) ? hashContent : fallback;
  }

  function updateHash(name) {
    if (!contentNames.has(name)) return;

    const nextHash = `#${name}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }

  function setScanNavigationEnabled(enabled) {
    scanNavigationEnabled = Boolean(enabled);
    document.querySelectorAll("[data-scan-link]").forEach(link => {
      link.classList.toggle("hidden", !scanNavigationEnabled);
    });
  }

  function refreshActiveNavigation(name = activeContent) {
    document.querySelectorAll("[data-content-link]").forEach(link => {
      const isActive = link.dataset.contentLink === name;
      link.classList.toggle("bg-neutral-200", isActive);
      link.classList.toggle("text-[#624292]", isActive);
      link.classList.toggle("text-white", !isActive);
    });

    setScanNavigationEnabled(scanNavigationEnabled);
  }

  async function loadContent(name, target = "#content-slot", context = {}) {
    if (name === "scan" && !scanNavigationEnabled && context.allowScan !== true) {
      name = "my-courses";
    }

    const host = await loadFragment({
      basePath: `/components/contents/${name}/${name}`,
      target,
      context: { ...context, name, type: "content" },
    });

    activeContent = name;

    if (context.updateHash !== false) {
      updateHash(name);
    }

    refreshActiveNavigation(name);

    return host;
  }

  async function compose(context = {}) {
    await Promise.all(
      Object.entries(slots).map(([name, target]) => loadComponent(name, target, context))
    );

    await loadContent(context.initialContent || "home", "#content-slot", {
      ...context,
      allowScan: true,
      updateHash: false,
    });
  }

  window.SACComponents = {
    compose,
    getContentFromHash,
    loadComponent,
    loadContent,
    refreshActiveNavigation,
    setScanNavigationEnabled,
  };
})();
