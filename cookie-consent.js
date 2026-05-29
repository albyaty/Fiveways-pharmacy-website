/*
 * Lightweight cookie notice. Self-injecting: include once per page with
 *   <script src="/cookie-consent.js" defer></script>
 * Shows a dismissible banner until the visitor acknowledges, then remembers
 * the choice in localStorage. Uses absolute paths so it works from any page
 * depth. To remove the whole feature: delete this file + the script tags.
 *
 * Note: the cookies this site sets (Stripe, Cal.com, account session) are
 * strictly necessary for checkout/booking/login, so this is a notice-style
 * banner. If you later add analytics/marketing cookies, gate them behind an
 * explicit "Accept" here before loading them.
 */
(function () {
  "use strict";
  var KEY = "fw_cookie_consent_v1";
  try {
    if (localStorage.getItem(KEY)) return;
  } catch (e) {
    /* localStorage blocked -> just show the banner */
  }

  function build() {
    var style = document.createElement("style");
    style.textContent =
      ".fw-cc{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);" +
      "z-index:9999;width:min(680px,calc(100% - 24px));background:#ffffff;" +
      "border:1px solid #bdd4d7;border-radius:16px;box-shadow:0 18px 40px rgba(39,75,80,.18);" +
      "padding:1rem 1.15rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;" +
      "font-family:Manrope,system-ui,sans-serif;color:#274b50}" +
      ".fw-cc p{margin:0;flex:1;min-width:220px;font-size:.9rem;line-height:1.5}" +
      ".fw-cc a{color:#0f757b;font-weight:700}" +
      ".fw-cc__btn{border:none;cursor:pointer;background:linear-gradient(135deg,#0f757b,#0a666b);" +
      "color:#fff;font-weight:800;border-radius:999px;padding:.6rem 1.2rem;font-size:.9rem;" +
      "font-family:inherit}" +
      ".fw-cc__btn:hover{transform:translateY(-1px)}" +
      "@media(max-width:520px){.fw-cc{flex-direction:column;align-items:stretch;text-align:center}" +
      ".fw-cc__btn{width:100%}}";
    document.head.appendChild(style);

    var bar = document.createElement("div");
    bar.className = "fw-cc";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie notice");
    bar.innerHTML =
      "<p>We use essential cookies to make payments, bookings and sign-in work, " +
      'and to keep the site secure. See our <a href="/cookies/">Cookie Policy</a>.</p>' +
      '<button type="button" class="fw-cc__btn">Got it</button>';
    document.body.appendChild(bar);

    bar.querySelector(".fw-cc__btn").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "1"); } catch (e) {}
      bar.parentNode && bar.parentNode.removeChild(bar);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
