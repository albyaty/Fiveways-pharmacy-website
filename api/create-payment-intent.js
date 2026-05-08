// Vercel serverless function: creates a Stripe PaymentIntent for the basket.
// The frontend sends only { id, qty } pairs. We look up the authoritative
// price here so a tampered client cannot underpay.

const Stripe = require("stripe");

// Authoritative product catalogue. MUST stay in sync with checkout.js until
// we move to a database. Prices are in pence (smallest GBP unit).
const PRODUCTS = {
  "vitamin-d3-1000iu-60": { name: "Vitamin D3 1000iu Tablets (60)", pricePence: 899 },
  "omega-3-high-strength-30": { name: "Omega 3 High Strength Softgels (30)", pricePence: 1250 },
  "hayfever-relief-30": { name: "Hayfever Relief Tablets (30)", pricePence: 725 },
  "sensitive-skin-balm-50ml": { name: "Sensitive Skin Daily Care Balm (50ml)", pricePence: 975 },
  "daily-multivitamin-60": { name: "Daily Multivitamin Capsules (60)", pricePence: 650 },
  "paracetamol-500-32": { name: "Paracetamol 500mg Tablets (32)", pricePence: 240 },
  "travel-first-aid": { name: "Travel First Aid Kit", pricePence: 1499 },
  "baby-bath-foam-250": { name: "Baby Soothing Bath Foam (250ml)", pricePence: 595 },
};

const FREE_DELIVERY_THRESHOLD_PENCE = 2500;
const STANDARD_DELIVERY_PENCE = 295;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }

  const items = Array.isArray(body && body.items) ? body.items : null;
  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Basket is empty" });
  }

  // Validate and price the basket against the server-side catalogue.
  let subtotalPence = 0;
  const lineSummary = [];
  for (const item of items) {
    if (!item || typeof item.id !== "string") {
      return res.status(400).json({ error: "Invalid basket item" });
    }
    const qty = Math.floor(Number(item.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 50) {
      return res.status(400).json({ error: `Invalid quantity for ${item.id}` });
    }
    const product = PRODUCTS[item.id];
    if (!product) {
      return res.status(400).json({ error: `Unknown product: ${item.id}` });
    }
    subtotalPence += product.pricePence * qty;
    lineSummary.push(`${qty}x ${product.name}`);
  }

  if (subtotalPence <= 0) {
    return res.status(400).json({ error: "Basket total must be greater than zero" });
  }

  const deliveryPence =
    subtotalPence >= FREE_DELIVERY_THRESHOLD_PENCE ? 0 : STANDARD_DELIVERY_PENCE;
  const totalPence = subtotalPence + deliveryPence;

  try {
    const stripe = new Stripe(secretKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalPence,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      description: "Fiveways Pharmacy order",
      metadata: {
        // Stripe metadata values must be strings under 500 chars each.
        line_items: lineSummary.join(" | ").slice(0, 480),
        subtotal_pence: String(subtotalPence),
        delivery_pence: String(deliveryPence),
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amountPence: totalPence,
      subtotalPence,
      deliveryPence,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Could not create payment", detail: err && err.message });
  }
};
