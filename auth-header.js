/*
 * Lightweight header auth-state toggle. Flips any element marked
 * [data-auth-login-link] from "Login / Register" to "My account" when the
 * visitor has a Supabase session -- WITHOUT loading the full supabase-js
 * library, so it's cheap to include on every page.
 *
 * It reads the session Supabase stores in localStorage (key
 * "sb-<project-ref>-auth-token"). This is a best-effort UI hint: clicking
 * through still hits account.html, which does the real (validated) auth
 * check and redirects to login if the session isn't actually valid.
 *
 * Load order on a page:  auth-config.js  then  auth-header.js
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

  function signedIn() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      var obj = JSON.parse(raw);
      var sess = obj && obj.currentSession ? obj.currentSession : obj;
      var token = sess && sess.access_token;
      if (!token) return false;
      var exp = sess && sess.expires_at; // unix seconds
      if (exp && exp * 1000 < Date.now()) return false; // expired
      return true;
    } catch (e) {
      return false;
    }
  }

  function apply() {
    if (!signedIn()) return;
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
