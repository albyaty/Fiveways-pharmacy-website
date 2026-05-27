/**
 * PAYMENT CONFIG  --  Constants for the prescription + custom payment flow.
 *
 * One file, read by both the frontend (service-payment.js) and the backend
 * (api/create-service-payment.js), so the £9.90 rate and the custom-amount
 * limits never drift out of sync.
 *
 * EDIT THIS WHEN
 *   - The pharmacy changes the per-item prescription fee
 *   - You want to raise/lower the custom-payment ceiling
 *
 * All amounts are in pence (integer). 990 = GBP 9.90.
 */

const PAYMENT_CONFIG = {
  PRESCRIPTION_ITEM_PRICE_PENCE: 990,
  MAX_PRESCRIPTION_ITEMS: 30,
  MIN_CUSTOM_PENCE: 100,
  MAX_CUSTOM_PENCE: 50000,
  CURRENCY: "gbp",
};

if (typeof window !== "undefined") {
  window.PAYMENT_CONFIG = PAYMENT_CONFIG;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PAYMENT_CONFIG;
}
