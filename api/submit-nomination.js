// Generic pharmacy form -> email handler. Receives a form submission from the
// browser (currently the repeat-prescription nomination form) and emails the
// full set of fields to the pharmacy via Resend. Reuses the same RESEND_API_KEY
// and PHARMACY_NOTIFY_EMAIL as the Stripe payment webhook, so no new account or
// config is needed.
//
// SECURITY / PRIVACY
//   - This form collects health-adjacent data (DOB, address, GP, repeat
//     medication names). It is emailed only to the pharmacy inbox(es) in
//     PHARMACY_NOTIFY_EMAIL, never exposed publicly or stored in the repo.
//   - All fields are server-trimmed and length-capped before use.
//   - A lightweight honeypot ("company" field) and required-field checks
//     reduce spam / bad submissions.
//
// REQUIRED ENV VARS (already set for the payment webhook):
//   RESEND_API_KEY          from resend.com
//   PHARMACY_NOTIFY_EMAIL   inbox(es) that receive the alerts (comma list ok)
//   NOTIFY_FROM_EMAIL       optional; defaults to Resend's shared sender

function clip(v, n) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, n);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const notifyList = (process.env.PHARMACY_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const notifyFrom =
    process.env.NOTIFY_FROM_EMAIL ||
    "Five Ways Pharmacy <onboarding@resend.dev>";

  if (!resendKey || notifyList.length === 0) {
    return res
      .status(503)
      .json({ error: "Form submissions are not configured on the server yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot: real users never fill this hidden field.
  if (clip(body.company, 100)) {
    return res.status(200).json({ ok: true }); // silently accept + drop
  }

  const fields = {
    "Form": clip(body.form_name, 80) || "Repeat prescription nomination",
    "Full name": clip(body.full_name, 120),
    "Date of birth": clip(body.date_of_birth, 20),
    "Email": clip(body.email, 200),
    "Phone": clip(body.phone, 40),
    "Home address": clip(body.home_address, 300),
    "Postcode": clip(body.postcode, 16),
    "GP surgery": clip(body.gp_surgery_name, 200),
    "Current nominated pharmacy": clip(body.current_nominated_pharmacy, 200),
    "Repeat medication names": clip(body.repeat_medication_names, 1500),
    "Preferred contact": clip(body.preferred_contact, 20),
    "Consent to contact": body.nomination_consent ? "Yes" : "No",
    "Privacy agreed": body.nomination_privacy ? "Yes" : "No",
  };

  // Required-field validation (server-side).
  if (!fields["Full name"]) return res.status(400).json({ error: "Full name is required." });
  if (!/^\S+@\S+\.\S+$/.test(fields["Email"])) return res.status(400).json({ error: "A valid email is required." });
  if (!fields["Phone"] || fields["Phone"].replace(/\D/g, "").length < 7) return res.status(400).json({ error: "A valid phone number is required." });
  if (!fields["Date of birth"]) return res.status(400).json({ error: "Date of birth is required." });
  if (!fields["Home address"]) return res.status(400).json({ error: "Home address is required." });
  if (!fields["Postcode"]) return res.status(400).json({ error: "Postcode is required." });
  if (!fields["GP surgery"]) return res.status(400).json({ error: "GP surgery name is required." });
  if (body.nomination_consent !== true && body.nomination_consent !== "true") {
    return res.status(400).json({ error: "Please confirm consent to be contacted." });
  }
  if (body.nomination_privacy !== true && body.nomination_privacy !== "true") {
    return res.status(400).json({ error: "Please agree to the privacy terms." });
  }

  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = Object.entries(fields).filter(([, v]) => v !== "");
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html =
    `<h2 style="font-family:Arial,sans-serif;color:#0a666b">New repeat-prescription nomination request</h2>` +
    `<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:5px 16px 5px 0;color:#5a7a7e;vertical-align:top">${esc(k)}</td>` +
          `<td style="padding:5px 0;font-weight:600;color:#274b50;white-space:pre-wrap">${esc(v)}</td></tr>`
      )
      .join("") +
    `</table>` +
    `<p style="font-family:Arial,sans-serif;font-size:12px;color:#8aa">Five Ways Pharmacy, automated form notification</p>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: notifyFrom,
        to: notifyList,
        subject: `Nomination request, ${fields["Full name"]}`,
        text,
        html,
        reply_to: fields["Email"] || undefined,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res.status(502).json({ error: "Could not send your request. Please call the pharmacy.", detail: detail.slice(0, 300) });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(502).json({ error: "Could not send your request. Please call the pharmacy." });
  }
};
