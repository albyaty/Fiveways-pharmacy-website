(() => {
  "use strict";

  // Booking page. Reads services.js, lists bookable services, and provides
  // hooks for cal.com integration. When cal.com is wired up, each "Book"
  // button should already have the right data-cal-link attribute and
  // cal.com's embed.js will take it from there.
  //
  // CONFIG: set CAL_USERNAME to your cal.com username so that buttons
  // resolve to https://cal.com/<username>/<eventSlug>. While this is null,
  // buttons render in a "pending" state.
  const CAL_USERNAME = "albayatilabs";

  const SERVICES = (typeof window !== "undefined" && window.SERVICES) || [];

  function bookableServices() {
    return SERVICES.filter((s) => s.enabled);
  }

  function render() {
    const grid = document.getElementById("bookable-services-grid");
    const empty = document.getElementById("bookable-empty");
    if (!grid) return;

    const services = bookableServices();
    if (services.length === 0) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = services
      .map((s) => {
        const ready = !!(CAL_USERNAME && s.calEventSlug);
        const calLink = ready ? CAL_USERNAME + "/" + s.calEventSlug : null;
        const cta = ready
          ? `<button type="button" class="bookable-card__cta bookable-card__cta--ready" data-cal-link="${calLink}" data-cal-namespace="" data-cal-config='{"layout":"month_view"}'>Book 30-min slot</button>`
          : `<button type="button" class="bookable-card__cta bookable-card__cta--pending" disabled aria-disabled="true">Booking setup pending</button>`;
        return `
          <article class="bookable-card">
            <span class="bookable-card__tag bookable-card__tag--free">Free &middot; 30 min</span>
            <h3 class="bookable-card__name">${s.name}</h3>
            <p class="bookable-card__desc">${s.description || ""}</p>
            ${cta}
          </article>
        `;
      })
      .join("");
  }

  render();
})();
