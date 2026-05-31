/*
 * Lightweight auth-state helper. Without loading the full supabase-js
 * library, it reads the Supabase session from localStorage and:
 *   1. Flips [data-auth-login-link] from "Login / Register" to "My account".
 *   2. Exposes window.FW_SESSION_USER = { name, email } when signed in (used
 *      to prefill the booking form). null/undefined when signed out.
 *
 * Best-effort UI only; pages that handle real data still validate via
 * supabase-js. Load order: auth-config.js then auth-header.js.
 */
(function () {
  "use strict";
  var cfg = (typeof window !== "undefined" && window.AUTH_CONFIG) || {};
  if (cfg.AUTH_ENABLED === false) return;

  var m = String(cfg.SUPABASE_URL || "").match(
    /https?:\/\/([a-z0-9-]+)\.supabase\./i
  );
  if (!m) return;
  var storageKey = "sb-" + m[1] + "-auth-token";

  function readSession() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      var sess = obj && obj.currentSession ? obj.currentSession : obj;
      if (!sess || !sess.access_token) return null;
      if (sess.expires_at && sess.expires_at * 1000 < Date.now()) return null;
      return sess;
    } catch (e) {
      return null;
    }
  }

  var sess = readSession();
  if (sess) {
    var u = sess.user || {};
    var meta = u.user_metadata || {};
    window.FW_SESSION_USER = {
      name: meta.full_name || "",
      email: u.email || "",
    };
  }

  function apply() {
    if (!sess) return;
    var els = document.querySelectorAll("[data-auth-login-link]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.setAttribute(
        "href",
        el.getAttribute("data-auth-account-href") || "account.html"
      );
      el.setAttribute("aria-label", "My account");
      var label = el.querySelector("[data-auth-label]");
      if (label) {
        label.textContent = "My account";
      } else {
        var sr = el.querySelector(".sr-only");
        if (sr) sr.textContent = "My account";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
