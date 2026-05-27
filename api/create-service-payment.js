// Creates a Stripe PaymentIntent for a single service. The frontend sends
// only { serviceId, customerEmail }. The server looks up the authoritative
// price from services.js -- the client cannot tamper with the amount.

const Stripe = require("stripe");
const SERVICES = require("../services.js");

function findService(id) {
  if (typeof id !== "string") return null;
  return SERVICES.find((s) => s.id === id) || null;
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

  // Vercel parses JSON bodies automatically, but accept stringified too.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const service = findService(body.serviceId);
  if (!service) {
    return res.status(400).json({ error: "Unknown service" });
  }
  if (!service.enabled) {
    return res
      .status(400)
      .json({ error: "This service is not currently available for payment." });
  }
  if (service.type !== "payable" && service.type !== "both") {
    return res
      .status(400)
      .json({ error: "This service is not payable through this checkout." });
  }
  if (!Number.isInteger(service.pricePence) || service.pricePence <= 0) {
    return res
      .status(400)
      .json({ error: "Service price is not configured correctly." });
  }

  const customerEmail =
    typeof body.customerEmail === "string" ? body.customerEmail.trim() : "";

  try {
    const stripe = new Stripe(secretKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: service.pricePence,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      description: "Five Ways Pharmacy - " + service.name,
      receipt_email: customerEmail || undefined,
      metadata: {
        service_id: service.id,
        service_name: service.name.slice(0, 480),
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      amountPence: service.pricePence,
      serviceName: service.name,
    });
  } catch (err) {
    return res.status(500).json({
      error: "Could not create payment",
      detail: err && err.message,
    });
  }
};
