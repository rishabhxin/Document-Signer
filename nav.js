(() => {
  "use strict";

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

  // Close drawer when selecting any link or CTA inside it
  drawer.addEventListener("click", (e) => {
    const link = e.target.closest("a, label[for]");
    if (link) {
      closeMenu({ restoreFocus: false });
    }
  });

  // Keyboard support: Escape to close, Tab focus trap
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

  // Automatically close drawer if resized to desktop width or when switching to editor/processing
  const desktopMq = window.matchMedia("(min-width: 961px)");
  const onDesktopChange = (ev) => {
    if (ev.matches && isOpen) closeMenu({ restoreFocus: false });
  };
  if (desktopMq.addEventListener) desktopMq.addEventListener("change", onDesktopChange);
  else if (desktopMq.addListener) desktopMq.addListener(onDesktopChange);

  window.addEventListener("opensign:document-loaded", () => closeMenu({ restoreFocus: false }));
})();
