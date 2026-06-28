(() => {
  "use strict";

  // Renders the service cards on book.html. Each card's "Book" button gets
  // a data-fw-cal attribute pointing at this service's cal.eu event slug.
  // We use data-fw-cal (not cal's own data-cal-link) so cal.eu's built-in
  // auto-binder does not also fire; the page-level click handler in
  // book.html is the sole opener of the cal.eu modal for the picked service.
  //
  // To change which services appear here, edit services.js (and create
  // matching event types in cal.eu). No change needed in this file.

  const CAL_USERNAME = "albayatilabs";

  const SERVICES = (typeof window !== "undefined" && window.SERVICES) || [];

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function visibleServices() {
    return SERVICES.filter((s) => s.enabled && s.calEventSlug);
  }

  function render() {
    const grid = document.getElementById("book-grid");
    const empty = document.getElementById("book-empty");
    if (!grid) return;

    const services = visibleServices();
    if (services.length === 0) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = services
      .map((s) => {
        const calLink = CAL_USERNAME + "/" + s.calEventSlug;
        return `
          <article class="book-card" role="listitem">
            <span class="book-card__tag">Free &middot; 30 min</span>
            <h3 class="book-card__name">${escapeHtml(s.name)}</h3>
            <p class="book-card__desc">${escapeHtml(s.description || "")}</p>
            <button
              type="button"
              class="book-card__cta"
              data-fw-cal="${escapeHtml(calLink)}"
              data-cal-config='{"layout":"month_view"}'
              aria-label="Book a ${escapeHtml(s.name)} appointment"
            >
              <span>Book ${escapeHtml(s.name)}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 12h12" />
                <path d="M13 7l5 5-5 5" />
              </svg>
            </button>
          </article>
        `;
      })
      .join("");
  }

  render();
})();
