(() => {
  const sentinel = document.querySelector(".compact-header-sentinel");
  if (!sentinel) return;

  const stickyOffset = 10;
  let stickyThreshold = 0;
  let scrollFrame = null;
  let measureFrame = null;

  const toggleStickyHeader = (active) => {
    document.body.classList.toggle("compact-header-active", active);
  };

  const measureStickyThreshold = () => {
    stickyThreshold = Math.max(0, Math.round(sentinel.getBoundingClientRect().top + window.scrollY - stickyOffset));
  };

  const syncStickyHeader = () => {
    toggleStickyHeader(window.scrollY >= stickyThreshold);
  };

  const requestStickySync = () => {
    if (scrollFrame !== null) return;

    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      syncStickyHeader();
    });
  };

  const requestStickyMeasure = () => {
    if (measureFrame !== null) return;

    measureFrame = window.requestAnimationFrame(() => {
      measureFrame = null;
      measureStickyThreshold();
      syncStickyHeader();
    });
  };

  measureStickyThreshold();
  syncStickyHeader();

  window.addEventListener("scroll", requestStickySync, { passive: true });
  window.addEventListener("resize", requestStickyMeasure);
  window.addEventListener("orientationchange", requestStickyMeasure);
  window.addEventListener("load", requestStickyMeasure, { once: true });
})();

(() => {
  const footerAccordions = Array.from(document.querySelectorAll(".footer-nav-accordion"));
  const footerAccordionViewport = window.matchMedia("(max-width: 980px)");
  let accordionMode = null;

  if (!footerAccordions.length) return;

  const syncFooterAccordions = () => {
    const nextMode = footerAccordionViewport.matches ? "mobile" : "desktop";
    if (nextMode === accordionMode) return;

    accordionMode = nextMode;

    footerAccordions.forEach((accordion) => {
      if (nextMode === "desktop") {
        accordion.setAttribute("open", "");
        return;
      }

      accordion.removeAttribute("open");
    });
  };

  syncFooterAccordions();

  if (typeof footerAccordionViewport.addEventListener === "function") {
    footerAccordionViewport.addEventListener("change", syncFooterAccordions);
  } else if (typeof footerAccordionViewport.addListener === "function") {
    footerAccordionViewport.addListener(syncFooterAccordions);
  }
})();

(() => {
  const menuToggle = document.querySelector(".mobile-menu-toggle");
  const menuShell = document.querySelector(".mobile-menu-shell");
  const menuDrawer = document.querySelector(".mobile-menu-drawer");
  const menuOverlay = document.querySelector(".mobile-menu-overlay");
  const menuClose = document.querySelector(".mobile-menu-close");
  const menuCloseButton = document.querySelector(".mobile-menu-close-button");
  const menuGroups = menuShell?.querySelectorAll(".mobile-menu-group");

  if (!menuToggle || !menuShell || !menuDrawer || !menuOverlay || !menuClose || !menuGroups) return;

  const mobileViewport = window.matchMedia("(max-width: 768px)");
  let lastFocusedElement = null;

  const closeMenu = ({ restoreFocus = true } = {}) => {
    document.body.classList.remove("mobile-menu-open");
    menuShell.setAttribute("aria-hidden", "true");
    menuDrawer.setAttribute("aria-hidden", "true");
    menuToggle.setAttribute("aria-expanded", "false");
    menuGroups.forEach((group) => {
      if (group instanceof HTMLDetailsElement) {
        group.open = false;
      }
    });

    if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
      lastFocusedElement.focus();
    }

    lastFocusedElement = null;
  };

  const openMenu = () => {
    if (!mobileViewport.matches) return;

    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.classList.add("mobile-menu-open");
    menuShell.setAttribute("aria-hidden", "false");
    menuDrawer.setAttribute("aria-hidden", "false");
    menuToggle.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      menuClose.focus();
    });
  };

  const toggleMenu = () => {
    if (document.body.classList.contains("mobile-menu-open")) {
      closeMenu();
      return;
    }

    openMenu();
  };

  menuToggle.addEventListener("click", toggleMenu);
  menuClose.addEventListener("click", () => closeMenu());
  menuCloseButton?.addEventListener("click", () => closeMenu());
  menuOverlay.addEventListener("click", () => closeMenu({ restoreFocus: false }));

  menuShell.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMenu({ restoreFocus: false }));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("mobile-menu-open")) {
      closeMenu();
    }
  });

  const syncMenuToViewport = () => {
    if (mobileViewport.matches) return;
    closeMenu({ restoreFocus: false });
  };

  if (typeof mobileViewport.addEventListener === "function") {
    mobileViewport.addEventListener("change", syncMenuToViewport);
  } else if (typeof mobileViewport.addListener === "function") {
    mobileViewport.addListener(syncMenuToViewport);
  }
})();

(() => {
  const closableDetails = Array.from(document.querySelectorAll(".top-strip-hours-dropdown, .header-phone-dropdown"));
  if (!closableDetails.length) return;
  const phoneDropdowns = closableDetails.filter((dropdown) => dropdown.classList.contains("header-phone-dropdown"));
  const phoneTimers = new WeakMap();

  const clearPhoneTimer = (dropdown) => {
    const timer = phoneTimers.get(dropdown);
    if (typeof timer === "number") {
      window.clearTimeout(timer);
      phoneTimers.delete(dropdown);
    }
  };

  const queuePhoneAutoClose = (dropdown) => {
    clearPhoneTimer(dropdown);
    if (!dropdown.open) return;

    const timer = window.setTimeout(() => {
      dropdown.open = false;
      phoneTimers.delete(dropdown);
    }, 5000);

    phoneTimers.set(dropdown, timer);
  };

  const closeOpenDetails = (target) => {
    closableDetails.forEach((dropdown) => {
      if (!dropdown.open) return;
      if (target instanceof Node && dropdown.contains(target)) return;
      clearPhoneTimer(dropdown);
      dropdown.open = false;
    });
  };

  phoneDropdowns.forEach((dropdown) => {
    dropdown.addEventListener("toggle", () => {
      if (!dropdown.open) {
        clearPhoneTimer(dropdown);
        return;
      }

      queuePhoneAutoClose(dropdown);
    });
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    closeOpenDetails(target);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeOpenDetails(null);
  });
})();

(() => {
  const desktopMedia = window.matchMedia("(min-width: 981px)");
  const dropdown = document.querySelector(".category-pill-dropdown--prescriptions");
  const trigger = dropdown?.querySelector("button");
  if (!dropdown || !(trigger instanceof HTMLButtonElement)) return;

  let autoCloseTimer = null;

  const clearAutoClose = () => {
    if (typeof autoCloseTimer === "number") {
      window.clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  };

  const setExpanded = (expanded) => {
    trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  const closeDropdown = () => {
    clearAutoClose();
    setExpanded(false);

    if (
      desktopMedia.matches &&
      dropdown.contains(document.activeElement) &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  };

  const queueAutoClose = () => {
    clearAutoClose();
    if (!desktopMedia.matches || dropdown.matches(":hover")) return;

    autoCloseTimer = window.setTimeout(() => {
      closeDropdown();
    }, 5000);
  };

  trigger.addEventListener("click", () => {
    if (!desktopMedia.matches) return;
    setExpanded(true);
    queueAutoClose();
  });

  dropdown.addEventListener("focusin", () => {
    if (!desktopMedia.matches) return;
    setExpanded(true);
    queueAutoClose();
  });

  dropdown.addEventListener("focusout", () => {
    if (!desktopMedia.matches) return;

    window.setTimeout(() => {
      if (dropdown.contains(document.activeElement)) return;
      if (dropdown.matches(":hover")) {
        setExpanded(true);
        return;
      }

      setExpanded(false);
    }, 0);
  });

  dropdown.addEventListener("pointerenter", () => {
    if (!desktopMedia.matches) return;
    clearAutoClose();
    setExpanded(true);
  });

  dropdown.addEventListener("pointerleave", () => {
    if (!desktopMedia.matches) return;
    closeDropdown();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!desktopMedia.matches) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (dropdown.contains(target)) return;
    closeDropdown();
  });

  window.addEventListener("scroll", () => {
    if (!desktopMedia.matches) return;
    closeDropdown();
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (!desktopMedia.matches) return;
    if (event.key !== "Escape") return;
    closeDropdown();
  });

  if (typeof desktopMedia.addEventListener === "function") {
    desktopMedia.addEventListener("change", (event) => {
      if (event.matches) return;
      closeDropdown();
    });
  } else if (typeof desktopMedia.addListener === "function") {
    desktopMedia.addListener((event) => {
      if (event.matches) return;
      closeDropdown();
    });
  }
})();
