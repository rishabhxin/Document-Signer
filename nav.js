(() => {
  "use strict";

  /* ---------- Desktop Navigation Dropdowns ---------- */
  const dropdowns = Array.from(document.querySelectorAll(".nav-dropdown"));

  function closeAllDropdowns(except = null) {
    for (const dd of dropdowns) {
      if (dd === except) continue;
      dd.classList.remove("is-open");
      const btn = dd.querySelector(".nav-drop-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  }

  for (const dd of dropdowns) {
    const btn = dd.querySelector(".nav-drop-btn");
    const menu = dd.querySelector(".nav-drop-menu");
    if (!btn || !menu) continue;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = !dd.classList.contains("is-open");
      closeAllDropdowns(willOpen ? dd : null);
      dd.classList.toggle("is-open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });

    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        closeAllDropdowns(dd);
        dd.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        menu.querySelector("a[href]")?.focus();
      } else if (e.key === "Escape") {
        closeAllDropdowns();
        btn.focus();
      }
    });

    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAllDropdowns();
        btn.focus();
      }
    });

    // Close when clicking an active link inside dropdown
    menu.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (a) closeAllDropdowns();
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dropdown")) {
      closeAllDropdowns();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  /* ---------- Mobile & Tablet Slide-Over Side Navigation Drawer ---------- */
  const toggle = document.getElementById("navToggle");
  const drawer = document.getElementById("sideNav");
  const backdrop = document.getElementById("sideNavBackdrop");
  const closeBtn = document.getElementById("sideNavClose");

  if (!toggle || !drawer || !backdrop) return;

  const FOCUSABLE = 'a[href], button:not([disabled]), label[for], [tabindex]:not([tabindex="-1"])';
  let isOpen = false;
  let lastFocused = null;

  function openMenu() {
    if (isOpen) return;
    closeAllDropdowns();
    isOpen = true;
    lastFocused = document.activeElement;

    drawer.hidden = false;
    backdrop.hidden = false;

    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      backdrop.classList.add("is-open");
      document.body.classList.add("nav-open");
      toggle.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      (closeBtn || drawer.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
    });
  }

  function closeMenu({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;

    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");

    const finish = () => {
      if (!isOpen) {
        drawer.hidden = true;
        backdrop.hidden = true;
      }
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      finish();
    } else {
      setTimeout(finish, 320);
    }

    if (restoreFocus && lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus({ preventScroll: true });
    }
  }

  toggle.addEventListener("click", () => {
    if (isOpen) closeMenu();
    else openMenu();
  });

  closeBtn?.addEventListener("click", () => closeMenu());
  backdrop.addEventListener("click", () => closeMenu());

  drawer.addEventListener("click", (e) => {
    const link = e.target.closest("a[href], label[for]");
    if (link) {
      closeMenu({ restoreFocus: false });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === "Tab") {
      const nodes = Array.from(drawer.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  const desktopMq = window.matchMedia("(min-width: 1281px)");
  const onDesktopChange = (ev) => {
    if (ev.matches && isOpen) closeMenu({ restoreFocus: false });
  };
  if (desktopMq.addEventListener) desktopMq.addEventListener("change", onDesktopChange);
  else if (desktopMq.addListener) desktopMq.addListener(onDesktopChange);

  window.addEventListener("opensign:document-loaded", () => {
    closeAllDropdowns();
    closeMenu({ restoreFocus: false });
  });
})();
