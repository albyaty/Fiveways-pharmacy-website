/**
 * SERVICES CONFIG  --  Bookable services catalogue (free 30-min slots).
 *
 * Five Ways Pharmacy currently offers a fixed set of free NHS / pharmacy
 * services that customers can book. There is no per-service payment; the
 * payment system (service-payment.html) handles prescription billing and
 * custom amounts separately. So this file is now ONLY the booking catalogue.
 *
 * The frontend reads this to render the list on book.html. cal.com is the
 * actual booking backend -- this file just lists what shows up in the UI
 * and tells cal.com which event-type slug to open for each.
 *
 * --------------------------------------------------------------------------
 * FIELDS
 * --------------------------------------------------------------------------
 *   id              URL-safe identifier. Used for analytics/links only.
 *   name            Display name shown to the customer.
 *   description     One-sentence blurb shown on booking cards.
 *   calEventSlug    cal.com event-type slug. The pharmacy owner must
 *                   create an event with this slug in their cal.com
 *                   account. Each event should be configured for 30 min.
 *   infoUrl         Optional. Path to the service's info page.
 *   enabled         false to hide without deleting.
 * --------------------------------------------------------------------------
 *
 * HOW TO ADD A SERVICE
 *   1. Add an object below.
 *   2. Create the matching event type (30-min slot) in cal.com with the
 *      same slug as calEventSlug.
 *   3. Set enabled: true.
 *   4. Commit + push.
 *
 * HOW TO HIDE A SERVICE
 *   Set enabled: false.
 */

const SERVICES = [
  {
    id: "pharmacy-first",
    name: "NHS Pharmacy First",
    description: "Free NHS support for common conditions, no GP appointment needed.",
    calEventSlug: "pharmacy-first",
    infoUrl: "./pharmacy-first/",
    enabled: true,
  },
  {
    id: "stop-smoking-clinic",
    name: "Stop Smoking Clinic",
    description: "Free quit-smoking support with a personalised plan.",
    calEventSlug: "stop-smoking",
    infoUrl: "./stop-smoking-clinic/",
    enabled: true,
  },
  {
    id: "nhs-contraception",
    name: "NHS Contraception Service",
    description: "Free contraception consultation and supply where eligible.",
    calEventSlug: "nhs-contraception",
    infoUrl: "./nhs-contraception-services/",
    enabled: true,
  },
  {
    id: "weight-loss-support",
    name: "Weight Loss Support",
    description: "Pharmacist-led weight loss programme with ongoing reviews.",
    calEventSlug: "weight-loss-support",
    infoUrl: "./weight-loss-support/",
    enabled: true,
  },
  {
    id: "flu-vaccine",
    name: "Flu Vaccine",
    description: "Book your seasonal flu vaccination appointment.",
    calEventSlug: "flu-vaccine",
    infoUrl: "./flu-vaccines/",
    enabled: true,
  },
  {
    id: "covid-vaccine",
    name: "COVID Vaccine",
    description: "Book your COVID-19 vaccination appointment.",
    calEventSlug: "covid-vaccine",
    infoUrl: "./covid-vaccines/",
    enabled: true,
  },
  {
    id: "umbrella-services",
    name: "Umbrella Services",
    description: "Bundled pharmacy services and reviews.",
    calEventSlug: "umbrella-services",
    infoUrl: "./umbrella-services/",
    enabled: true,
  },
  {
    id: "health-advice",
    name: "Health Advice",
    description: "Speak with a pharmacist about everyday health questions.",
    calEventSlug: "health-advice",
    infoUrl: "./health-advice/",
    enabled: true,
  },
];

// Universal export -- browser (window.SERVICES) and Node.js (module.exports).
if (typeof window !== "undefined") {
  window.SERVICES = SERVICES;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = SERVICES;
}
