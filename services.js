/**
 * SERVICES CONFIG  --  Single source of truth for paid + bookable services.
 *
 * THIS IS THE FILE TO EDIT WHEN A SERVICE IS ADDED, REMOVED, OR REPRICED.
 * The frontend reads it to render service pickers; the backend reads it to
 * validate prices server-side before creating Stripe PaymentIntents.
 *
 * The file is "universal" -- it works both as a browser <script> (sets
 * window.SERVICES) and as a Node.js module (module.exports). Do not split it
 * into separate frontend/backend copies; keeping one source of truth prevents
 * the prices on the site from ever drifting from the prices Stripe charges.
 *
 * --------------------------------------------------------------------------
 * FIELDS
 * --------------------------------------------------------------------------
 *   id              URL-safe identifier. Used in ?service= URLs, Stripe
 *                   metadata, and (eventually) cal.com routing. Lowercase
 *                   kebab-case, never change once a customer has paid for it.
 *
 *   name            Display name shown to the customer.
 *
 *   description     One-sentence blurb shown on picker cards.
 *
 *   pricePence      Integer, in pence. Use 0 for free (NHS) services.
 *                   Server treats this as the authoritative price -- the
 *                   client cannot tamper with it.
 *
 *   type            One of:
 *                     "payable"  -- pay now, no booking required
 *                     "bookable" -- book a time slot, no payment required
 *                                   (free / NHS services)
 *                     "both"     -- pay AND pick a time (cal.com handles both
 *                                   via its Stripe integration)
 *                     "free"     -- free, no booking required (rare; usually
 *                                   "bookable" instead)
 *
 *   calEventSlug    cal.com event-type slug. Required for "bookable" or
 *                   "both". Set to null if cal.com is not yet configured for
 *                   this service -- the booking page will mark it pending.
 *
 *   infoUrl         Optional. Path to the service's info page (e.g.
 *                   "./pharmacy-first/"). Used to link "Learn more" buttons.
 *
 *   enabled         Boolean. Set to false to hide without deleting.
 *                   Disabled services do NOT appear in any picker and the
 *                   server rejects payment attempts for them. Use this when
 *                   pricing is unconfirmed or the service is being prepared.
 * --------------------------------------------------------------------------
 *
 * HOW TO ADD A SERVICE
 *   1. Add a new object below.
 *   2. If "bookable" or "both", create the matching event type in cal.com.
 *   3. Commit and push -- Vercel rebuilds, the new service appears.
 *
 * HOW TO REPRICE A SERVICE
 *   Change pricePence here, commit, push. No other change needed.
 *
 * HOW TO TEMPORARILY HIDE A SERVICE
 *   Set enabled: false. Existing payment records (Stripe, cal.com) are not
 *   affected; only new customers cannot select it.
 */

const SERVICES = [
  /* ----------------------------------------------------------------------
   * EXAMPLES BELOW -- replace prices/descriptions with the real values
   * agreed with the pharmacy owner before going live. Mark enabled: true
   * once confirmed.
   * --------------------------------------------------------------------*/

  {
    id: "private-consultation",
    name: "Private Consultation",
    description: "Speak privately with a pharmacist about your health concern.",
    pricePence: 3500,
    type: "both",
    calEventSlug: "private-consultation",
    infoUrl: null,
    enabled: false,
  },
  {
    id: "weight-loss-support",
    name: "Weight Loss Support",
    description: "Pharmacist-led weight loss programme with ongoing reviews.",
    pricePence: 6000,
    type: "both",
    calEventSlug: "weight-loss-initial",
    infoUrl: "./weight-loss-support/",
    enabled: false,
  },
  {
    id: "flu-vaccine-private",
    name: "Private Flu Vaccine",
    description: "Seasonal flu vaccination, suitable for adults not eligible for NHS.",
    pricePence: 1500,
    type: "both",
    calEventSlug: "flu-vaccine",
    infoUrl: "./flu-vaccines/",
    enabled: false,
  },
  {
    id: "travel-consultation",
    name: "Travel Health Consultation",
    description: "Pre-travel assessment with vaccination recommendations.",
    pricePence: 2500,
    type: "both",
    calEventSlug: "travel-consultation",
    infoUrl: null,
    enabled: false,
  },
  {
    id: "umbrella-services",
    name: "Umbrella Services",
    description: "Bundled pharmacy review and recommendations.",
    pricePence: 4500,
    type: "payable",
    calEventSlug: null,
    infoUrl: "./umbrella-services/",
    enabled: false,
  },

  /* ----------------------------------------------------------------------
   * FREE SERVICES -- no payment, only booking (cal.com event handles it).
   * Listed here so the booking router widget can render them.
   * --------------------------------------------------------------------*/

  {
    id: "pharmacy-first",
    name: "NHS Pharmacy First",
    description: "Free NHS support for common conditions, no GP appointment needed.",
    pricePence: 0,
    type: "bookable",
    calEventSlug: "pharmacy-first",
    infoUrl: "./pharmacy-first/",
    enabled: false,
  },
  {
    id: "stop-smoking-clinic",
    name: "Stop Smoking Clinic",
    description: "Free quit-smoking support with personalised plan.",
    pricePence: 0,
    type: "bookable",
    calEventSlug: "stop-smoking",
    infoUrl: "./stop-smoking-clinic/",
    enabled: false,
  },
  {
    id: "nhs-contraception",
    name: "NHS Contraception Service",
    description: "Free contraception consultation and supply where eligible.",
    pricePence: 0,
    type: "bookable",
    calEventSlug: "nhs-contraception",
    infoUrl: "./nhs-contraception-services/",
    enabled: false,
  },
];

/* --------------------------------------------------------------------------
 * Universal export -- works in browser (<script>) and Node.js (require).
 * Do not change this footer; it is what lets one file serve both worlds.
 * ------------------------------------------------------------------------*/
if (typeof window !== "undefined") {
  window.SERVICES = SERVICES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = SERVICES;
}
