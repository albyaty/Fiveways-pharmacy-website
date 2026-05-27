# Service Payments & Booking — Architecture

This document is for the next agent (or developer) who picks up the Five Ways
Pharmacy site. Read this before touching `service-payment.*`, `book.*`,
`api/*`, `services.js`, or `payment-config.js`.

## Why this exists

Five Ways Pharmacy is a service business, not a shop. There are no products
and no cart. Two separate customer flows need to work:

1. **Booking** — customers can book a 30-minute appointment with the
   pharmacy for one of several free NHS / pharmacy services (Pharmacy First,
   Stop Smoking, Flu Vaccine, Weight Loss Support, etc.). No payment.
   Handled end-to-end by cal.com (embedded on `book.html`).

2. **Payment** — customers who phoned the pharmacy and were told to pay
   (e.g. for prescription items, or a one-off amount agreed by the team) go
   to `service-payment.html` and either:
     a. Count their prescription items (£9.90 each, free delivery), or
     b. Enter a custom amount the pharmacy team told them by phone,
   then enter their identifying details (name, DOB, phone, optional
   recipient) and pay through Stripe.

The two flows are completely independent. They share only the brand
chrome (header/footer) and the design tokens in `styles.css`.

## The shape

```
                  ┌─────────────────┐
   booking flow → │  services.js    │ ← bookable free services list
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐         ┌──────────┐
                  │   book.html     │ ──────► │ cal.com  │
                  │   + book.js     │  embed  └──────────┘
                  └─────────────────┘

                  ┌──────────────────────┐
  payment flow →  │   payment-config.js  │ ← £9.90 rate, custom-amount limits
                  └─────────┬────────────┘
                            │
        ┌───────────────────┼─────────────────────────┐
        ▼                                             ▼
┌────────────────────────┐                ┌──────────────────────────┐
│ service-payment.html   │                │ api/create-service-      │
│ + .css + .js           │  ───────────►  │ payment.js               │
│ (prescription / custom │  POST with     │ (validates server-side,  │
│ + customer details +   │  type, amount, │  creates PaymentIntent   │
│ Stripe Element)        │  customer info │  with metadata)          │
└──────────┬─────────────┘                └────────────┬─────────────┘
           │                                           │
           ▼                                           ▼
     success.html                              Stripe Dashboard
     (verifies PI with Stripe,                 + emailed receipt
      shows summary + reference)               + Stripe mobile push
                                               (pharmacy team is notified
                                               instantly with all metadata)
```

## Files (only the ones this system owns)

| File | Purpose | Edit when... |
|---|---|---|
| `services.js` | List of bookable free services for `book.html` | Service added / removed |
| `payment-config.js` | Prescription per-item price + custom-amount limits | The £9.90 rate or the cap changes |
| `api/stripe-config.js` | Returns publishable key from env vars | Never (env vars do the swap) |
| `api/create-service-payment.js` | Validates + creates Stripe PaymentIntent | Payment logic changes |
| `service-payment.html` | Two-choice form: prescription / custom + customer details | UI/copy changes |
| `service-payment.css` | Page styling | UI tweaks |
| `service-payment.js` | Form state, validation, Stripe Element flow | Behaviour changes |
| `book.html` | Booking page (cal.com embed placeholder) | When cal.com is wired, replace placeholder |
| `book.css` | Booking page styles | UI tweaks |
| `book.js` | Renders bookable services + cal.com data attributes | Set `CAL_USERNAME` once cal.com is wired |
| `success.html` | Post-payment confirmation (reads PI + metadata) | Rarely |
| `package.json` | Declares `stripe` Node SDK | New backend deps only |

Everything else in the repo is the marketing site and is owned by the
homepage redesign — do not edit those files for payment/booking work.

## Reasoning summary

### Why a single hardcoded £9.90 rate?

The pharmacy told us all prescription items are the same fixed fee. So we
don't need a Stripe Products catalogue, a per-item config, or any
admin UI. One constant in `payment-config.js` does it. If the rate ever
changes, edit that constant and redeploy.

### Why a "custom amount" option at all?

The pharmacy team may agree non-prescription amounts with customers by
phone (e.g. paying for a delivery, settling an old balance, paying for a
service the pharmacist did in person). Forcing those through a fake
"prescription" count would lie to the team in the dashboard. A separate
custom-amount path keeps the data clean: every Stripe payment is tagged
with `payment_type: "prescription" | "custom"` so the pharmacy can audit.

### Why server-side amount calculation?

Stripe charges whatever amount the server sends in the PaymentIntent.
If the frontend sent the price, a malicious user could pay 1p for an
arbitrary prescription. So `api/create-service-payment.js`:

- Reads only `{ type, items, customAmountPence }` shape hints from the client.
- Re-derives the amount from `payment-config.js` on the server.
- For prescription: amount = items × PRESCRIPTION_ITEM_PRICE_PENCE.
- For custom: amount must be within MIN_CUSTOM_PENCE..MAX_CUSTOM_PENCE.

The client cannot tamper with what Stripe is told to charge.

### Why all the customer fields, and how the pharmacy sees them

The pharmacy needs to match the online payment to the customer who phoned
in. We collect:

- **Email** — so Stripe can email a receipt automatically.
- **Full name** — billing identity.
- **Date of birth** — verifying the patient against their records.
- **Phone number** — so the team can call back if something's unclear.
- **Recipient name** (optional) — for cases where the medication is for a
  family member or dependent, not the cardholder.
- **Delivery address** (prescription flow only) — defaults to the card's
  billing address (which the pharmacy reads from the Stripe Dashboard);
  customer can opt-in to a separate delivery address via a checkbox. UK
  postcode is regex-validated server-side.

All of these go into Stripe **metadata** on the PaymentIntent. The
pharmacy team sees them three ways without us writing any extra code:

1. **Email**: Stripe sends a per-payment email to the account email
   (configure in Stripe Dashboard → Settings → Personal → Notifications).
   The email links to the payment detail page where metadata is visible.
2. **Mobile push**: the Stripe iOS/Android app pushes notifications in
   real time when a payment lands.
3. **Live dashboard**: anyone with team access can keep the Payments page
   open; new payments appear without refresh.

All three happen within seconds of a successful payment. That gives the
"customer calls and we can verify they paid" guarantee without any custom
notification code.

### Why no custom email-to-pharmacy webhook (yet)?

It's nice but not necessary for v1. The native Stripe email + dashboard
+ mobile app cover the brief. Adding a Stripe webhook + a transactional
email service (Resend / Postmark) is a future enhancement — see "Open
items" below. The webhook would let us send a formatted email to multiple
pharmacy staff with all fields in the body, plus optionally an SMS.

### Why cal.com for booking?

A real booking system needs slot management, double-booking prevention,
admin UI, email reminders, cancellations, calendar sync (Google /
Outlook), timezones. cal.com already does all of it for free, has a clean
embed, and lets the pharmacy owner manage event types and availability
without involving a developer. Custom-building this would be weeks of
work and a permanent maintenance burden.

## How to use the system

### Add a new bookable service

1. Open `services.js`. Add an object with `id`, `name`, `description`,
   `calEventSlug`, optional `infoUrl`, and `enabled: true`.
2. In cal.com, create a matching event type (30-minute slot, free) with
   the same slug.
3. Commit and push. It appears on `book.html` immediately.

### Change the prescription per-item rate

Edit `PRESCRIPTION_ITEM_PRICE_PENCE` in `payment-config.js`. Commit. Push.
The frontend and backend both pick up the new rate on the next deploy.

### Raise or lower the custom-amount cap

Edit `MAX_CUSTOM_PENCE` in `payment-config.js`.

### Hide a bookable service without losing config

Set `enabled: false` in `services.js`.

### Cal.com setup (already wired)

`CAL_USERNAME` in `book.js` is set to `albayatilabs`. The cal.com embed
script is loaded in `book.html` (the official one-liner that exposes the
global `Cal()` function). Buttons rendered by `book.js` have
`data-cal-link="albayatilabs/<calEventSlug>"`; cal.com's embed runtime
intercepts clicks and opens the calendar in a modal overlay on top of
the page.

**Slug matching is critical.** Each `calEventSlug` in `services.js` must
exactly match the URL slug of the matching event type in cal.com. If a
button opens a "Event not found" modal, the slugs don't match -- either
rename the event in cal.com or update `services.js`.

### Adding a new bookable service after cal.com is configured

1. Create the new event type in cal.com (30-minute slot, free).
2. Add a matching entry to `services.js` with the same slug as
   `calEventSlug`, plus `enabled: true`.
3. Push.

### Connect Stripe (already done for test mode)

The system uses two environment variables in Vercel:

- `STRIPE_PUBLISHABLE_KEY` — `pk_test_...` for testing, `pk_live_...` for production
- `STRIPE_SECRET_KEY` — `sk_test_...` for testing, `sk_live_...` for production

**Going live** is a three-step change with no code edits:

1. Pharmacy owner finishes their Stripe business verification.
2. They invite the developer to their Stripe account as a **Developer**
   team member.
3. Developer copies the live keys into Vercel → Settings → Environment
   Variables, overwriting the test keys. Trigger a redeploy.

**Important**: also enable per-payment email notifications in the
pharmacy's Stripe account at Settings → Personal → Notifications so the
team gets notified of every successful payment. Without this enabled,
they would only see payments by opening the dashboard themselves.

### Test the payment flow

Stripe test cards:

- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 9995` — insufficient funds (declines)
- `4000 0000 0000 0002` — generic decline
- Expiry: any future date. CVC: any 3 digits.
- Address: any valid UK postcode (try `SW1A 1AA`).

Successful test payments appear in Stripe Dashboard → Payments (Test
mode toggle in the top right). All metadata fields (customer name, DOB,
phone, recipient, payment type, summary) appear on the payment detail
page.

## What NOT to do

- **Don't put the secret key in any file.** It lives only in Vercel env
  vars.
- **Don't read the amount from the request body in `create-service-payment.js`.**
  Always derive it from `payment-config.js` based on `type` + `items` or
  `customAmountPence`. The client must never decide the charged amount.
- **Don't add a cart or basket back.** The pharmacy specifically does not
  sell products. A "multi-prescription" use case is already covered by the
  item counter; no other multi-line scenario exists.
- **Don't duplicate `payment-config.js` or `services.js`** in a second
  file. Both are universal modules (browser + Node) for exactly this
  reason. If you're tempted to duplicate, fix the import in the file you
  were going to copy into.
- **Don't add an account/login system to the payment page.** Pharmacy
  payments are infrequent, often one-off. The customer's identifying info
  is collected on the form itself — no signup needed.

## Open items / future work

- **Custom webhook + pharmacy email.** Add `api/stripe-webhook.js` that
  subscribes to `payment_intent.succeeded`, verifies the
  `STRIPE_WEBHOOK_SECRET`, formats a friendly email, and sends it to a
  shared pharmacy inbox via Resend or Postmark. Nice-to-have on top of
  Stripe's built-in notifications.
- **SMS notification to pharmacist on duty.** Same webhook, plus Twilio.
  Useful if the pharmacy wants instant phone alerts during opening hours.
- **Move services to a database** so the pharmacy owner can manage them
  without a code deploy. Supabase + a simple admin page would work. Only
  worth it once the pharmacy owner actually wants to edit services
  themselves; not needed until then.
- **Pharmacist admin view.** A `/admin` page showing recent payments,
  recent bookings, and verification status would save the team from
  switching between Stripe and cal.com dashboards. Out of scope for v1.
