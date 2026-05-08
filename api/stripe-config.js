// Returns the Stripe publishable key from environment so the frontend never
// hardcodes test/live keys. Only the publishable key is exposed -- it is safe
// to share publicly. The secret key never leaves the server.

module.exports = (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return res.status(500).json({ error: "Stripe publishable key is not configured." });
  }
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({ publishableKey });
};
