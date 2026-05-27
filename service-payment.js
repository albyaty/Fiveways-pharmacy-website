(() => {
  "use strict";

  // The page has three possible views (picker, single-service form, error).
  // We swap between them based on the ?service= URL parameter and what
  // services.js currently contains.

  const SERVICES = (typeof window !== "undefined" && window.SERVICES) || [];

  let stripe = null;
  let stripePublishableKey = null;
  let elements = null;
  let activeService = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatGBP(pence) {
    return "GBP " + (pence / 100).toFixed(2);
  }

  function payableServices() {
    return SERVICES.filter(
      (s) => s.enabled && (s.type === "payable" || s.type === "both")
    );
  }

  function findService(id) {
    return SERVICES.find((s) => s.id === id) || null;
  }

  function getRequestedServiceId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("service");
    return id ? id.trim() : null;
  }

  function showView(name) {
    const ids = [
      "service-picker-view",
      "service-payment-view",
      "service-payment-error-view",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.hidden = id !== name;
    });
  }

  function showError(message) {
    const errEl = document.getElementById("payment-error");
    if (!errEl) return;
    if (!message) {
      errEl.hidden = true;
      errEl.textContent = "";
      return;
    }
    errEl.hidden = false;
    errEl.textContent = message;
  }

  // ---------------------------------------------------------------------------
  // Picker view
  // ---------------------------------------------------------------------------
  function renderPicker() {
    const grid = document.getElementById("service-picker-grid");
    const empty = document.getElementById("service-picker-empty");
    if (!grid) return;

    const services = payableServices();
    if (services.length === 0) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = services
      .map(
        (s) => `
        <article class="service-pick-card" role="listitem">
          <h3 class="service-pick-card__name">${s.name}</h3>
          <p class="service-pick-card__desc">${s.description || ""}</p>
          <div class="service-pick-card__meta">
            <p class="service-pick-card__price">${formatGBP(s.pricePence)}</p>
            <a class="service-pick-card__cta" href="./service-payment.html?service=${encodeURIComponent(s.id)}">
              <span>Continue</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 12h12" />
                <path d="M13 7l5 5-5 5" />
              </svg>
            </a>
          </div>
        </article>
      `
      )
      .join("");
  }

  // ---------------------------------------------------------------------------
  // Single-service payment flow
  // ---------------------------------------------------------------------------
  async function loadPublishableKey() {
    const res = await fetch("/api/stripe-config");
    if (!res.ok) {
      throw new Error("Could not load Stripe configuration.");
    }
    const data = await res.json();
    if (!data || !data.publishableKey) {
      throw new Error("Stripe publishable key is missing.");
    }
    return data.publishableKey;
  }

  async function createPaymentIntent(serviceId, customerEmail) {
    const res = await fetch("/api/create-service-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, customerEmail: customerEmail || "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not create the payment.");
    }
    return data;
  }

  function renderServiceSummary(service) {
    const nameEl = document.getElementById("payment-service-name");
    if (nameEl) nameEl.textContent = "Pay for " + service.name;

    const summaryName = document.getElementById("service-summary-name");
    if (summaryName) summaryName.textContent = service.name;

    const summaryDesc = document.getElementById("service-summary-description");
    if (summaryDesc) summaryDesc.textContent = service.description || "";

    const amount = document.getElementById("service-summary-amount");
    if (amount) amount.textContent = formatGBP(service.pricePence);

    const total = document.getElementById("service-summary-total");
    if (total) total.textContent = formatGBP(service.pricePence);

    document.title = service.name + " | Pay | Five Ways Pharmacy";
  }

  async function bootPaymentView(service) {
    activeService = service;
    renderServiceSummary(service);
    showView("service-payment-view");

    const payBtn = document.getElementById("pay-btn");

    try {
      if (!stripe) {
        stripePublishableKey = await loadPublishableKey();
        if (typeof Stripe === "undefined") {
          throw new Error("Stripe.js failed to load.");
        }
        stripe = Stripe(stripePublishableKey);
      }

      const intent = await createPaymentIntent(service.id, "");

      elements = stripe.elements({
        clientSecret: intent.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0f757b",
            colorText: "#274b50",
            fontFamily: "Manrope, sans-serif",
            borderRadius: "10px",
          },
        },
      });

      const addressElement = elements.create("address", {
        mode: "billing",
        allowedCountries: ["GB"],
      });
      addressElement.mount("#address-element");

      const paymentElement = elements.create("payment", {
        layout: { type: "tabs" },
      });
      paymentElement.mount("#payment-element");

      const banner = document.getElementById("payment-test-banner");
      if (banner) {
        banner.hidden = !(stripePublishableKey || "").startsWith("pk_test_");
      }

      if (payBtn) {
        payBtn.disabled = false;
        payBtn.querySelector(".pay-btn-label").textContent =
          "Pay " + formatGBP(intent.amountPence);
      }
    } catch (err) {
      showError(err && err.message ? err.message : "Something went wrong.");
      if (payBtn) {
        payBtn.querySelector(".pay-btn-label").textContent = "Payment unavailable";
      }
    }
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (!stripe || !elements || !activeService) return;

    const emailInput = document.getElementById("payment-email");
    const email = emailInput ? emailInput.value.trim() : "";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showError("Please enter a valid email address for your receipt.");
      emailInput?.focus();
      return;
    }
    showError(null);

    const payBtn = document.getElementById("pay-btn");
    if (payBtn) {
      payBtn.setAttribute("aria-busy", "true");
      payBtn.querySelector(".pay-btn-label").textContent = "Processing...";
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/success.html",
        receipt_email: email,
      },
    });

    if (error) {
      showError(error.message || "Payment could not be completed.");
      if (payBtn) {
        payBtn.removeAttribute("aria-busy");
        payBtn.querySelector(".pay-btn-label").textContent =
          "Pay " + formatGBP(activeService.pricePence);
      }
    }
    // On success Stripe redirects to return_url; no further code runs here.
  }

  // ---------------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------------
  function init() {
    const requestedId = getRequestedServiceId();
    if (!requestedId) {
      renderPicker();
      showView("service-picker-view");
      return;
    }

    const service = findService(requestedId);
    if (!service || !service.enabled) {
      const msgEl = document.getElementById("service-payment-error-message");
      if (msgEl) {
        msgEl.textContent = service
          ? "This service is not currently available for online payment."
          : "We could not find that service.";
      }
      showView("service-payment-error-view");
      return;
    }

    if (service.type !== "payable" && service.type !== "both") {
      const msgEl = document.getElementById("service-payment-error-message");
      if (msgEl) {
        msgEl.textContent =
          "This service is bookable but not paid online. Please use the booking page.";
      }
      showView("service-payment-error-view");
      return;
    }

    bootPaymentView(service);
  }

  document
    .getElementById("service-payment-form")
    ?.addEventListener("submit", submitPayment);

  init();
})();
