/**
 * AUTH ENGINE  --  thin wrapper around Supabase Auth. The whole accounts
 * feature talks to Supabase only through window.FWAuth defined here, so the
 * auth provider can be swapped (or removed) in one place.
 *
 * Pages that use this must load, in order:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="./auth-config.js"></script>
 *   <script src="./auth.js"></script>
 */
(function () {
  "use strict";

  var cfg = window.AUTH_CONFIG || {};
  var FWAuth = {
    enabled: !!cfg.AUTH_ENABLED,
    configured: !!(cfg.AUTH_ENABLED && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY),
    client: null,
  };

  if (
    FWAuth.configured &&
    window.supabase &&
    typeof window.supabase.createClient === "function"
  ) {
    FWAuth.client = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );
  }

  function client() {
    if (!FWAuth.client) {
      throw new Error(
        "Accounts aren't connected yet. Add your Supabase URL + anon key in auth-config.js."
      );
    }
    return FWAuth.client;
  }

  // --- Auth actions -------------------------------------------------------
  FWAuth.signUp = function (email, password, meta) {
    return client().auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + "/login.html?verified=1",
        // Stored on the auth user; a DB trigger copies these into the
        // profiles table on signup (see supabase-setup.sql).
        data: meta || {},
      },
    });
  };

  FWAuth.signIn = function (email, password) {
    return client().auth.signInWithPassword({
      email: email,
      password: password,
    });
  };

  FWAuth.signOut = function () {
    return client().auth.signOut();
  };

  FWAuth.resetRequest = function (email) {
    return client().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password.html",
    });
  };

  FWAuth.updatePassword = function (password) {
    return client().auth.updateUser({ password: password });
  };

  FWAuth.getUser = async function () {
    if (!FWAuth.client) return null;
    try {
      var r = await FWAuth.client.auth.getUser();
      return (r && r.data && r.data.user) || null;
    } catch (e) {
      return null;
    }
  };

  // Redirect to login if not signed in. Use on protected pages (account.html).
  FWAuth.requireAuth = async function (redirectTo) {
    var u = await FWAuth.getUser();
    if (!u) {
      window.location.href = redirectTo || "./login.html";
      return null;
    }
    return u;
  };

  // --- Header state: swap "Login / Register" for "My account" when signed in.
  // Header links opt in with [data-auth-login-link] and an optional
  // [data-auth-label] inner element for the text to change.
  FWAuth.applyHeaderState = async function () {
    if (!FWAuth.enabled) return;
    var els = document.querySelectorAll("[data-auth-login-link]");
    if (!els.length) return;
    var u = await FWAuth.getUser();
    els.forEach(function (el) {
      if (!u) return;
      var accountHref = el.getAttribute("data-auth-account-href") || "account.html";
      el.setAttribute("href", accountHref);
      var label = el.querySelector("[data-auth-label]");
      if (label) label.textContent = "My account";
    });
  };

  window.FWAuth = FWAuth;

  document.addEventListener("DOMContentLoaded", function () {
    if (FWAuth.client) FWAuth.applyHeaderState();
  });
})();
