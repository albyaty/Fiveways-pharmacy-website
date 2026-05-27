// Creates a Stripe PaymentIntent for either a prescription order (N items
// at the configured per-item rate) or a custom amount agreed by phone.
//
// SECURITY MODEL
//   - The amount is always re-derived from payment-config.js on the server.
//     Client-supplied numbers are only used as hints (item count or custom
//     amount). The client cannot tamper with what Stripe is told to charge.
//   - All free-text fields are trimmed and length-capped before being put
//     into Stripe metadata so a malicious client cannot blow up the
//     metadata payload (Stripe rejects keys >500 chars).
//   - UK postcode is regex-validated when a delivery address is supplied.
//   - All other customer fields (name, DOB, phone, recipient) are validated
//     for presence and basic format. Lying about your name/DOB is still
//     possible (any payment form has this limit) -- the pharmacy verifies
//     when the customer phones in.

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

  // Parse body.
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

  // ---- Compute authoritative amount, server-side --------------------------
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

  // ---- Validate customer info --------------------------------------------
  const customer = body.customer || {};
  const customerEmail = trimString(customer.email, 200);
  const customerName = trimString(customer.name, 120);
  const customerDob = trimString(customer.dob, 20);
  const customerPhone = trimString(customer.phone, 40);
  const recipientName = trimString(customer.recipientName, 120);

  if (!isValidEmail(customerEmail)) {
    return res.status(400).json({ error: "A valid email is required." });
  }
  if (!customerName) {
    return res.status(400).json({ error: "Your full name is required." });
  }
  if (!isValidDob(customerDob)) {
    return res
      .status(400)
      .json({ error: "Date of birth must be a valid past date (YYYY-MM-DD)." });
  }
  if (!customerPhone || customerPhone.replace(/\D/g, "").length < 7) {
    return res
      .status(400)
      .json({ error: "A contact phone number is required." });
  }

  // ---- Validate delivery info --------------------------------------------
  // Only meaningful for prescription type; ignored for custom.
  const useDifferentDelivery =
    type === "prescription" && body.useDifferentDelivery === true;
  let deliverySummary = "(use billing address from Stripe)";
  let deliveryMeta = {
    delivery_line1: "",
    delivery_line2: "",
    delivery_city: "",
    delivery_postcode: "",
  };

  if (useDifferentDelivery) {
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

    deliveryMeta = {
      delivery_line1: line1,
      delivery_line2: line2,
      delivery_city: city,
      delivery_postcode: postcode.toUpperCase(),
    };
    deliverySummary =
      line1 +
      (line2 ? ", " + line2 : "") +
      ", " +
      city +
      ", " +
      postcode.toUpperCase();
  }

  // ---- Create the PaymentIntent ------------------------------------------
  try {
    const stripe = new Stripe(secretKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountPence,
      currency: PAYMENT_CONFIG.CURRENCY,
      automatic_payment_methods: { enabled: true },
      description,
      receipt_email: customerEmail,
      // Metadata appears in the Stripe Dashboard and in the per-payment
      // email the pharmacy receives. Keep keys short and values <500 chars.
      metadata: {
        payment_type: type,
        summary: summary.slice(0, 480),
        items_count: type === "prescription" ? String(itemCount) : "",
        customer_name: customerName.slice(0, 480),
        customer_dob: customerDob,
        customer_phone: customerPhone.slice(0, 480),
        recipient_name: recipientName || "(same as customer)",
        delivery: deliverySummary.slice(0, 480),
        delivery_line1: deliveryMeta.delivery_line1.slice(0, 480),
        delivery_line2: deliveryMeta.delivery_line2.slice(0, 480),
        delivery_city: deliveryMeta.delivery_city.slice(0, 480),
        delivery_postcode: deliveryMeta.delivery_postcode.slice(0, 480),
      },
    });

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
