/**
 * ACCOUNTS CONFIG  --  the single integration + removal point for the
 * optional customer login system.
 *
 * ---------------------------------------------------------------------------
 * TO ENABLE
 *   1. Create a free project at supabase.com.
 *   2. Project Settings -> API -> copy the "Project URL" and the "anon public"
 *      key (NOT the service_role key).
 *   3. Paste them below. The anon key is SAFE to expose in frontend code --
 *      it only allows what your Row Level Security policies permit, exactly
 *      like the Stripe publishable key.
 *
 * TO SOFT-DISABLE (keep the code, hide the feature)
 *   Set AUTH_ENABLED = false. Account UI hides and the auth pages redirect
 *   home. Nothing else on the site breaks.
 *
 * TO HARD-REMOVE
 *   Delete: auth-config.js, auth.js, auth.css, login.html, register.html,
 *   reset-password.html, account.html, and the [data-auth-login-link] markup
 *   in the site headers. No other file depends on these.
 * ---------------------------------------------------------------------------
 */
window.AUTH_CONFIG = {
  AUTH_ENABLED: true,

  // Paste your Supabase values here:
  SUPABASE_URL: "",        // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // the anon / public key (safe to expose)
};
