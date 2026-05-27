# Service Payments & Booking — Architecture

This document is for the next agent (or developer) who picks up the Five Ways
Pharmacy site. Read this before touching `service-payment.*`, `book.*`,
`api/*`, or `services.js`.

## Why this exists

The site sells **pharmacy services**, not products. Services come in three
shapes:

- **Bookable but free** (NHS Pharmacy First, Stop Smoking Clinic, NHS
  Contraception) — customer needs a calendar slot, no payment.
- **Payable but not booked** (e.g. paying off a bundled service, settling an
  invoice) — customer pays a fixed price, pharmacy follows up to schedule.
- **Both** (Private Consultation, Travel Vaccines, Weight Loss Support) —
  customer picks a time AND pays.

The brief explicitly said *no products, no cart*. Many service pages are
unfinished and prices/services will keep changing. So the system is built
**service-agnostic**: the payment/booking infrastructure is independent of
which service pages exist or are polished. New services don't require new
code — they require editing one config file.

## The shape

```
                ┌───────────────┐
                │  services.js  │  ← single source of truth (frontend + backend)
                └───────┬───────┘
        ┌───────────────┼───────────────────┐
        │               │                   │
        ▼               ▼                   ▼
┌──────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│ book.html    │ │ service-        │ │ api/create-service-     │
│ + book.js    │ │ payment.html    │ │ payment.js              │
│ (cal.com)    │ │ + .css + .js    │ │ (Stripe PaymentIntent)  │
└──────┬───────┘ │ (Stripe Element)│ └────────────┬────────────┘
       │         └────────┬────────┘              │
       │                  │                       │
       ▼                  ▼                       ▼
   cal.com           success.html             Stripe Dashboard
   (booking +        (confirmation,           (payments, payouts,
   payment when      pulls metadata           webhook events,
   Stripe app        from Stripe              refunds)
   installed)        PaymentIntent)
```

## Files (only the ones this system owns)

| File | Purpose | Edit when... |
|---|---|---|
| `services.js` | Authoritative list of services with prices, types, cal.com slugs | Service is added / removed / repriced |
| `api/stripe-config.js` | Returns the publishable key from env vars | Never (rely on env vars to swap test/live) |
| `api/create-service-payment.js` | Backend that creates Stripe PaymentIntents | Logic changes (taxes, discounts, etc.) |
| `service-payment.html` | Generic per-service checkout page | UI/copy changes |
| `service-payment.css` | Styling for the checkout page | UI tweaks |
| `service-payment.js` | Frontend payment flow + service picker | Behaviour changes |
| `book.html` | Booking page (cal.com embed placeholder) | When cal.com is connected, replace placeholder block |
| `book.css` | Styling for booking page | UI tweaks |
| `book.js` | Lists bookable services, prepares cal.com data attributes | Set `CAL_USERNAME` once cal.com is connected |
| `success.html` | Post-payment confirmation (reads Stripe PaymentIntent) | Rarely |
| `package.json` | Declares `stripe` Node SDK | New backend deps only |

Everything else in the repo belongs to the marketing site (homepage, service
info pages, brand assets) and should not be touched by anyone working on
payments or booking.

## Reasoning summary

### Why one config file (`services.js`) instead of per-service code?

Services churn. Prices change. Some services exist only as placeholder ideas
for weeks before launch. Hardcoding service IDs and prices into HTML and JS
would mean a code edit + deploy for every change. Putting them in one
config means **adding a service is a one-line edit in one file**. The site
auto-renders pickers and the backend auto-validates. Both frontend and
backend `require`/`<script>` the same file, so prices on the site can never
drift from prices Stripe actually charges.

### Why "universal" (browser + Node) export from `services.js`?

We need the same data in two runtimes (browser JS and Vercel serverless
functions). The two options were:
1. Duplicate the file (sync risk — bound to fail eventually).
2. One file with `if (typeof window !== "undefined")` and `if (typeof
   module !== "undefined")` guards.

Option 2 keeps a single source of truth at the cost of a slightly weird
file footer. We chose option 2.

### Why a generic checkout (`service-payment.html`) and not per-service pages?

So service info pages can be incomplete or missing entirely. The "Pay" CTA
on the homepage already exists (it links to `service-payment.html`) and
takes the customer to a page that lists what's currently available
(`enabled: true` in `services.js`). Adding a new service means adding a
config entry — no new HTML file required.

The page accepts a `?service=<id>` URL parameter, so a future service info
page can deep-link directly to its payment with one anchor tag:
`<a href="/service-payment.html?service=travel-consultation">Pay £25</a>`.

### Why server-side price validation?

Stripe charges whatever amount the server sends in the PaymentIntent. If
the frontend sent the price, a malicious user could pay 1p for a £35
service by tampering with the JS in their browser. So
`api/create-service-payment.js` ignores any price hint from the client and
looks the price up itself from `services.js`. The client only sends
`serviceId` and `customerEmail`.

### Why cal.com instead of a custom booking system?

A real booking system needs: slot management, double-booking prevention,
admin UI for the pharmacy, email confirmations, reminder emails,
cancellations, rescheduling, calendar sync (Google/Outlook), timezone
handling. That's weeks of work and a permanent maintenance burden. Cal.com
already does all of it for free, has Stripe integration built in, and
embeds in our page so it looks native. The pharmacy owner manages services
and hours in the cal.com dashboard — no code changes needed for those
edits.

### Why a placeholder for cal.com instead of a real embed?

So we can ship the architecture without waiting for the pharmacy owner to
finish their cal.com onboarding. When they're ready, the next step is just
to (1) set `CAL_USERNAME` in `book.js` and (2) replace the
`#cal-placeholder` block in `book.html` with the embed snippet from the
cal.com dashboard. No other code changes.

## How to use the system

### Add a new service

1. Open `services.js`.
2. Copy an existing entry, give it a new `id`, fill in name/description.
3. Set `pricePence` (integer pence, e.g. `2500` = £25.00).
4. Set `type`: `payable` / `bookable` / `both` / `free`.
5. If bookable/both, create the matching event type in cal.com and set
   `calEventSlug` to its slug.
6. Set `enabled: true` once pricing and cal.com event are confirmed with
   the pharmacy owner.
7. Commit and push — Vercel rebuilds, the new service appears in pickers
   and is accepted by the backend.

### Reprice a service

Change `pricePence`. Commit. Push. Done.

### Hide a service without losing config

Set `enabled: false`. Existing Stripe receipts and cal.com bookings are not
affected; only new customers can no longer select it.

### Connect cal.com (one-time setup)

1. Pharmacy owner creates a free cal.com account.
2. For every entry in `services.js` with `type: "bookable"` or `"both"`,
   they create a matching event type whose slug equals `calEventSlug`.
3. For paid bookable services (`type: "both"`), they install the cal.com
   Stripe app and attach it to those event types. Cal.com then collects
   payment during the booking flow — those customers do NOT need to use
   `service-payment.html`.
4. In `book.js`, set `CAL_USERNAME` to the pharmacy's cal.com username.
5. In `book.html`, replace the `#cal-placeholder` block with the embed
   snippet from cal.com dashboard → Embed.

### Connect Stripe (already done for test mode)

The system uses two environment variables in Vercel:

- `STRIPE_PUBLISHABLE_KEY` — `pk_test_...` for testing, `pk_live_...` for production
- `STRIPE_SECRET_KEY` — `sk_test_...` for testing, `sk_live_...` for production

**Going live** is a three-step change:

1. Pharmacy owner finishes their Stripe business verification.
2. They invite the developer to their Stripe account as a **Developer** team member.
3. Developer copies the live keys (`pk_live_...`, `sk_live_...`) and pastes
   them into Vercel → Settings → Environment Variables, overwriting the
   test keys. Trigger a redeploy.

**No code changes are needed to go live.** The publishable key is fetched
from `/api/stripe-config` at runtime, and the secret key is read from
`process.env.STRIPE_SECRET_KEY` inside the serverless function.

### Test the payment flow

In Stripe test mode, use these card numbers:

- `4242 4242 4242 4242` — always succeeds
- `4000 0000 0000 9995` — insufficient funds (declines)
- `4000 0000 0000 0002` — generic decline
- Expiry: any future date. CVC: any 3 digits. Postcode: any valid UK postcode.

Successful test payments show up in Stripe Dashboard → Payments (toggle
"Test mode" in the top right).

## What NOT to do

- **Don't put the secret key in any file.** It belongs only in Vercel env vars.
- **Don't read the price from the request body in `create-service-payment.js`.**
  Always look it up from `services.js`. This is the single most important
  security invariant.
- **Don't add cart logic back.** The cart was deliberately removed because
  the site is service-only. If a future need for multiple-services-in-one-
  payment arises, extend the existing endpoint to accept an array of
  serviceIds rather than reintroducing client-side cart state.
- **Don't create per-service HTML payment pages** unless there is a strong
  UX reason. The single generic page with `?service=` works for any new
  service for free.
- **Don't duplicate the service catalogue** in a second file. The whole
  point of `services.js` being universal is to avoid that. If you find
  yourself wanting a second copy, fix the file you're tempted to create
  the copy in.

## Open items / future work

- **Webhook for fulfilment.** Right now, the success page tells the
  customer "we'll be in touch shortly", but no automated email goes to the
  pharmacy team when a payment succeeds. Add a Vercel function at
  `api/stripe-webhook.js` that subscribes to `payment_intent.succeeded`,
  authenticates with `STRIPE_WEBHOOK_SECRET`, and sends an order email
  (via Resend, Postmark, etc.) to the pharmacy.
- **Move services to Stripe Products/Prices as source of truth.** Once the
  pharmacy is comfortable with Stripe, the cleanest end state is to define
  services as Stripe Products and fetch them via the Stripe API at build
  or request time. `services.js` then becomes obsolete and the pharmacy
  owner manages everything from the Stripe dashboard.
- **Pharmacist admin view.** A `/admin` route showing recent payments and
  bookings would save the pharmacy from having to open multiple
  dashboards. Out of scope for v1.
- **Refunds.** Currently refunds are processed by the pharmacy team
  directly in the Stripe Dashboard. A "Refund" button in a custom admin
  view would be nice eventually.
