/*
 * Prefills the payment form for signed-in customers, so they don't retype
 * details already on their account:
 *   - Email from the auth user
 *   - Name / phone / date of birth from their profile (profiles table)
 *   - A "use a saved address" picker that fills the delivery fields
 *
 * Runs independently of service-payment.js -- it only sets input values that
 * service-payment.js reads at submit time. Silently does nothing if the
 * customer is signed out or accounts aren't configured.
 */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }
  function setIfEmpty(id, value) {
    var node = el(id);
    if (node && !node.value && value) node.value = value;
  }

  async function run() {
    if (!window.FWAuth || !window.FWAuth.client) return;
    var db = window.FWAuth.client;

    var user = await window.FWAuth.getUser();
    if (!user) return;

    setIfEmpty("patient-email", user.email || "");

    // Profile -> name / phone / dob
    try {
      var pr = await db
        .from("profiles")
        .select("full_name,phone,date_of_birth")
        .eq("id", user.id)
        .maybeSingle();
      if (!pr.error && pr.data) {
        setIfEmpty("patient-name", pr.data.full_name);
        setIfEmpty("patient-phone", pr.data.phone);
        setIfEmpty("patient-dob", pr.data.date_of_birth);
      }
    } catch (e) { /* no profile yet */ }

    // Saved addresses -> picker that fills the delivery fields
    try {
      var ar = await db
        .from("addresses")
        .select("*")
        .order("created_at", { ascending: false });
      if (ar.error || !ar.data || !ar.data.length) return;

      var wrap = el("saved-address-wrap");
      var sel = el("saved-address-picker");
      if (!wrap || !sel) return;

      ar.data.forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent =
          (a.label ? a.label + ", " : "") +
          [a.line1, a.city, a.postcode].filter(Boolean).join(", ");
        opt.dataset.line1 = a.line1 || "";
        opt.dataset.line2 = a.line2 || "";
        opt.dataset.city = a.city || "";
        opt.dataset.postcode = a.postcode || "";
        sel.appendChild(opt);
      });
      wrap.hidden = false;

      sel.addEventListener("change", function () {
        var o = sel.options[sel.selectedIndex];
        if (!o || !o.value) return;
        el("delivery-line1").value = o.dataset.line1 || "";
        el("delivery-line2").value = o.dataset.line2 || "";
        el("delivery-city").value = o.dataset.city || "";
        el("delivery-postcode").value = o.dataset.postcode || "";
      });
    } catch (e) { /* addresses unavailable */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
