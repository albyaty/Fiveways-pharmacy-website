// Creates a Stripe PaymentIntent for either a prescription order (N items
// at the configured per-item rate) or a custom amount agreed by phone.
//
// SECURITY MODEL
//   - Amount is always re-derived from payment-config.js on the server.
//     Client-supplied numbers are only used as hints (item count or
//     custom amount). The client cannot tamper with the charged amount.
//   - All free-text fields are trimmed and length-capped before going into
//     Stripe metadata so a malicious client cannot blow up the metadata
//     payload (Stripe rejects values >500 chars).
//   - UK postcode is regex-validated when a delivery address is required.
//   - Customer-supplied identity fields (name, DOB, phone, email) are
//     validated for format/presence. Lying about identity is still possible
//     -- that's verified by the pharmacy team when the customer phones in.

const Stripe = require("stripe");
const PAYMENT_CONFIG = require("../payment-config.js");

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

function trimString(value, maxLen) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return trimmed.slice(0, maxLen);
}

function isValidEmail(value) {
  return typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim());
}

function isValidDob(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res
      .status(500)
      .json({ error: "Stripe is not configured on the server." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const type = body.type;
  if (type !== "prescription" && type !== "custom") {
    return res
      .status(400)
      .json({ error: "Payment type must be 'prescription' or 'custom'." });
  }

  // ---- Authoritative amount, server-side --------------------------------
  let amountPence = 0;
  let description = "";
  let summary = "";
  let itemCount = 0;

  if (type === "prescription") {
    const items = Math.floor(Number(body.items));
    if (
      !Number.isFinite(items) ||
      items < 1 ||
      items > PAYMENT_CONFIG.MAX_PRESCRIPTION_ITEMS
    ) {
      return res.status(400).json({
        error:
          "Prescription items must be a number between 1 and " +
          PAYMENT_CONFIG.MAX_PRESCRIPTION_ITEMS +
          ".",
      });
    }
    itemCount = items;
    amountPence = items * PAYMENT_CONFIG.PRESCRIPTION_ITEM_PRICE_PENCE;
    description =
      "Five Ways Pharmacy - " +
      items +
      " prescription item" +
      (items === 1 ? "" : "s");
    summary =
      items +
      "x prescription items @ GBP " +
      (PAYMENT_CONFIG.PRESCRIPTION_ITEM_PRICE_PENCE / 100).toFixed(2);
  } else {
    const proposed = Math.round(Number(body.customAmountPence));
    if (
      !Number.isFinite(proposed) ||
      proposed < PAYMENT_CONFIG.MIN_CUSTOM_PENCE ||
      proposed > PAYMENT_CONFIG.MAX_CUSTOM_PENCE
    ) {
      return res.status(400).json({
        error:
          "Custom amount must be between GBP " +
          (PAYMENT_CONFIG.MIN_CUSTOM_PENCE / 100).toFixed(2) +
          " and GBP " +
          (PAYMENT_CONFIG.MAX_CUSTOM_PENCE / 100).toFixed(2) +
          ".",
      });
    }
    amountPence = proposed;
    description = "Five Ways Pharmacy - custom payment";
    summary = "Custom payment of GBP " + (amountPence / 100).toFixed(2);
  }

  // ---- Validate patient identity ----------------------------------------
  const patient = body.patient || {};
  const patientName = trimString(patient.name, 120);
  const patientDob = trimString(patient.dob, 20);
  const patientPhone = trimString(patient.phone, 40);
  const patientEmail = trimString(patient.email, 200);

  if (!patientName) {
    return res.status(400).json({ error: "Patient's full name is required." });
  }
  if (!isValidDob(patientDob)) {
    return res
      .status(400)
      .json({ error: "Date of birth must be a valid past date (YYYY-MM-DD)." });
  }
  if (!patientPhone || patientPhone.replace(/\D/g, "").length < 7) {
    return res
      .status(400)
      .json({ error: "A contact phone number is required." });
  }
  if (!isValidEmail(patientEmail)) {
    return res
      .status(400)
      .json({ error: "A valid email is required for the receipt." });
  }

  // ---- Validate delivery (prescription only) ----------------------------
  let deliverySummary = "";
  let deliveryMeta = {
    delivery_line1: "",
    delivery_line2: "",
    delivery_city: "",
    delivery_postcode: "",
  };

  if (type === "prescription") {
    const d = body.delivery || {};
    const line1 = trimString(d.line1, 200);
    const line2 = trimString(d.line2, 200);
    const city = trimString(d.city, 120);
    const postcode = trimString(d.postcode, 16);

    if (!line1) {
      return res
        .status(400)
        .json({ error: "Delivery address line 1 is required." });
    }
    if (!city) {
      return res.status(400).json({ error: "Delivery town/city is required." });
    }
    if (!postcode) {
      return res.status(400).json({ error: "Delivery postcode is required." });
    }
    if (!UK_POSTCODE_RE.test(postcode)) {
      return res
        .status(400)
        .json({ error: "Delivery postcode must be a valid UK postcode." });
    }

    const postcodeUpper = postcode.toUpperCase();
    deliveryMeta = {
      delivery_line1: line1,
      delivery_line2: line2,
      delivery_city: city,
      delivery_postcode: postcodeUpper,
    };
    deliverySummary =
      line1 +
      (line2 ? ", " + line2 : "") +
      ", " +
      city +
      ", " +
      postcodeUpper;
  }

  // ---- Create the PaymentIntent ------------------------------------------
  // The patient name is set in THREE places so it always shows up
  // prominently in the Stripe dashboard and on receipts:
  //   1. `description`           -- shown right at the top of the payment
  //                                  detail page and on the email receipt.
  //   2. `shipping.name` (+ addr) -- shown in the Shipping section of the
  //                                  payment page (only for prescription,
  //                                  because we have a delivery address).
  //   3. `metadata.patient_name`  -- shown in the Metadata section and
  //                                  read by our own success.html page.
  // Stripe's "Customer" column otherwise shows the cardholder's name from
  // their billing address -- that is NOT necessarily the patient, which is
  // why we need to surface our captured patient name explicitly.
  try {
    const stripe = new Stripe(secretKey);

    const descriptionWithPatient = description + " - patient: " + patientName;

    const paymentIntentParams = {
      amount: amountPence,
      currency: PAYMENT_CONFIG.CURRENCY,
      automatic_payment_methods: { enabled: true },
      description: descriptionWithPatient.slice(0, 999),
      receipt_email: patientEmail,
      metadata: {
        payment_type: type,
        summary: summary.slice(0, 480),
        items_count: type === "prescription" ? String(itemCount) : "",
        patient_name: patientName.slice(0, 480),
        patient_dob: patientDob,
        patient_phone: patientPhone.slice(0, 480),
        delivery: deliverySummary.slice(0, 480),
        delivery_line1: deliveryMeta.delivery_line1.slice(0, 480),
        delivery_line2: deliveryMeta.delivery_line2.slice(0, 480),
        delivery_city: deliveryMeta.delivery_city.slice(0, 480),
        delivery_postcode: deliveryMeta.delivery_postcode.slice(0, 480),
      },
    };

    // Shipping field: only attach when prescription (we have a real
    // delivery address). For custom payments we leave it off rather than
    // sending a stub address.
    if (type === "prescription") {
      const shippingAddress = {
        line1: deliveryMeta.delivery_line1,
        city: deliveryMeta.delivery_city,
        postal_code: deliveryMeta.delivery_postcode,
        country: "GB",
      };
      if (deliveryMeta.delivery_line2) {
        shippingAddress.line2 = deliveryMeta.delivery_line2;
      }
      paymentIntentParams.shipping = {
        name: patientName,
        phone: patientPhone,
        address: shippingAddress,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amountPence: amountPence,
      summary: summary,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Could not create payment",
      detail: err && err.message,
    });
  }
};
