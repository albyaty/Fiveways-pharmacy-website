// Emails the pharmacy the FULL patient + order details the instant a payment
// succeeds. Stripe's own notification emails only show the payer (cardholder)
// name + amount, and don't fire in test mode at all. This webhook includes the
// patient name, DOB, phone, email, what they paid for, and delivery address --
// and works in BOTH test and live mode.
//
// SECURITY MODEL
//   We deliberately do NOT use raw-body Stripe signature verification, because
//   Vercel pre-parses the request body and getting the exact raw bytes back is
//   fragile. Instead:
//     1. The endpoint is guarded by a secret token in the URL (?token=...),
//        configured both here (env var) and in the Stripe webhook URL. Blocks
//        random/anonymous POSTs.
//     2. We re-fetch the PaymentIntent from Stripe using our secret key, so the
//        data in the email is always authentic Stripe data -- never anything an
//        attacker put in the request body.
//   This is plenty for an internal notification email. If you later want strict
//   signature verification, switch to constructEvent with the raw body.
//
// REQUIRED ENV VARS (all set in Vercel -> Settings -> Environment Variables):
//   STRIPE_SECRET_KEY       already set (used to re-fetch the payment)
//   RESEND_API_KEY          from resend.com (free)
//   PHARMACY_NOTIFY_EMAIL   inbox that should receive the alerts
//   STRIPE_WEBHOOK_TOKEN    any random string; also put it in the webhook URL
//   NOTIFY_FROM_EMAIL       optional; defaults to Resend's shared sender

const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // (1) URL token guard.
  const expectedToken = process.env.STRIPE_WEBHOOK_TOKEN;
  if (expectedToken && (!req.query || req.query.token !== expectedToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  // PHARMACY_NOTIFY_EMAIL accepts ONE address or a comma-separated list, e.g.
  // "owner@x.com, pharmacist@x.com". Set it as a single Vercel variable --
  // you cannot add the same variable name twice.
  // NOTE: Resend only delivers to arbitrary addresses once you've verified a
  // sending domain. Until then it can reliably send only to the inbox you
  // registered the Resend account with (see ARCHITECTURE.md).
  const notifyList = (process.env.PHARMACY_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notifyFrom =
    process.env.NOTIFY_FROM_EMAIL ||
    "Five Ways Pharmacy <onboarding@resend.dev>";

  // Always return 200 so Stripe doesn't retry-storm while setup is incomplete.
  if (!secretKey || !resendKey || notifyList.length === 0) {
    return res
      .status(200)
      .json({ ok: true, skipped: "notifications not fully configured" });
  }

  let event = req.body;
  if (typeof event === "string") {
    try { event = JSON.parse(event); } catch (e) { event = {}; }
  }
  if (!event || event.type !== "payment_intent.succeeded") {
    return res.status(200).json({ ok: true, ignored: event && event.type });
  }

  const piId =
    event.data && event.data.object && event.data.object.id
      ? event.data.object.id
      : null;
  if (!piId) return res.status(200).json({ ok: true, note: "no payment id" });

  try {
    const stripe = new Stripe(secretKey);
    // (2) Re-fetch authentic data from Stripe -- never trust the payload body.
    //     Expand the charge so we can read the cardholder name + card used.
    const pi = await stripe.paymentIntents.retrieve(piId, {
      expand: ["latest_charge"],
    });
    const m = pi.metadata || {};
    const amount = "GBP " + (pi.amount / 100).toFixed(2);

    const charge =
      pi.latest_charge && typeof pi.latest_charge === "object"
        ? pi.latest_charge
        : null;
    const cardholder =
      (charge && charge.billing_details && charge.billing_details.name) || "-";
    const card =
      charge &&
      charge.payment_method_details &&
      charge.payment_method_details.card
        ? charge.payment_method_details.card
        : null;
    const cardLabel = card ? `${card.brand} ****${card.last4}` : "-";
    const paidAt = new Date(
      (pi.created || Math.floor(Date.now() / 1000)) * 1000
    ).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const dashUrl =
      "https://dashboard.stripe.com/" +
      (pi.livemode ? "" : "test/") +
      "payments/" +
      pi.id;

    const rows = [
      ["Amount", amount],
      ["Paid at", paidAt + " (UK time)"],
      ["Paying for", m.summary || "Pharmacy payment"],
      ["Patient name", m.patient_name || "-"],
      ["Date of birth", m.patient_dob || "-"],
      ["Phone", m.patient_phone || "-"],
      ["Email", pi.receipt_email || "-"],
      ["Deliver to", m.delivery || "-"],
      ["Cardholder name", cardholder],
      ["Card used", cardLabel],
      ["Payment type", m.payment_type || "-"],
      ["Stripe reference", pi.id],
    ];

    const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const text =
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\nView this payment in Stripe: ${dashUrl}`;
    const html =
      `<h2 style="font-family:Arial,sans-serif;color:#0a666b">New payment received &mdash; ${esc(amount)}</h2>` +
      `<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">` +
      rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:5px 16px 5px 0;color:#5a7a7e">${esc(k)}</td>` +
            `<td style="padding:5px 0;font-weight:600;color:#274b50">${esc(v)}</td></tr>`
        )
        .join("") +
      `</table>` +
      `<p style="font-family:Arial,sans-serif;font-size:14px;margin-top:16px">` +
      `<a href="${dashUrl}" style="color:#0f757b;font-weight:700">View this payment in Stripe &rarr;</a></p>` +
      `<p style="font-family:Arial,sans-serif;font-size:12px;color:#8aa">Five Ways Pharmacy &middot; automated payment notification</p>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: notifyList,
        subject: `New payment ${amount} - ${m.patient_name || "patient"}`,
        text,
        html,
        reply_to: pi.receipt_email || undefined,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res.status(200).json({ ok: false, emailError: detail.slice(0, 300) });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err && err.message });
  }
};
