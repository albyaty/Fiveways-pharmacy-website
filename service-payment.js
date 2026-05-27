(() => {
  "use strict";

  const CONFIG = (typeof window !== "undefined" && window.PAYMENT_CONFIG) || {
    PRESCRIPTION_ITEM_PRICE_PENCE: 990,
    MAX_PRESCRIPTION_ITEMS: 30,
    MIN_CUSTOM_PENCE: 100,
    MAX_CUSTOM_PENCE: 50000,
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let paymentType = "prescription"; // "prescription" | "custom"
  let prescriptionItems = 1;
  let customAmountPence = 0;

  let stripe = null;
  let stripePublishableKey = null;
  let elements = null;
  let activeAmountPence = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatGBP(pence) {
    return "GBP " + (pence / 100).toFixed(2);
  }

  function parseCustomAmountPence() {
    const input = document.getElementById("custom-amount-input");
    if (!input) return 0;
    const value = parseFloat(input.value);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value * 100);
  }

  function currentAmountPence() {
    if (paymentType === "prescription") {
      return prescriptionItems * CONFIG.PRESCRIPTION_ITEM_PRICE_PENCE;
    }
    return customAmountPence;
  }

  function showSetupError(message) {
    const el = document.getElementById("setup-error");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function showPaymentError(message) {
    const el = document.getElementById("payment-error");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  // ---------------------------------------------------------------------------
  // UI rendering
  // ---------------------------------------------------------------------------
  function renderType() {
    document.querySelectorAll(".payment-type-option").forEach((btn) => {
      const isActive = btn.getAttribute("data-type") === paymentType;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
    document.getElementById("amount-section-prescription").hidden =
      paymentType !== "prescription";
    document.getElementById("amount-section-custom").hidden =
      paymentType !== "custom";
    showSetupError(null);
  }

  function renderPrescription() {
    const subtotal = prescriptionItems * CONFIG.PRESCRIPTION_ITEM_PRICE_PENCE;
    const countEl = document.getElementById("prescription-count");
    if (countEl) countEl.textContent = String(prescriptionItems);
    const subEl = document.getElementById("prescription-subtotal");
    if (subEl) subEl.textContent = formatGBP(subtotal);
    const totEl = document.getElementById("prescription-total");
    if (totEl) totEl.textContent = formatGBP(subtotal);

    document.querySelectorAll(
      "#prescription-counter [data-counter-action]"
    ).forEach((btn) => {
      const action = btn.getAttribute("data-counter-action");
      if (action === "dec") btn.disabled = prescriptionItems <= 1;
      if (action === "inc")
        btn.disabled = prescriptionItems >= CONFIG.MAX_PRESCRIPTION_ITEMS;
    });
  }

  function renderCustom() {
    customAmountPence = parseCustomAmountPence();
    const totEl = document.getElementById("custom-total");
    if (totEl) totEl.textContent = formatGBP(customAmountPence);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function collectCustomerInfo() {
    const email = document.getElementById("customer-email").value.trim();
    const name = document.getElementById("customer-name").value.trim();
    const dob = document.getElementById("customer-dob").value.trim();
    const phone = document.getElementById("customer-phone").value.trim();
    const recipientChecked = document.getElementById(
      "recipient-toggle-input"
    ).checked;
    const recipientName = recipientChecked
      ? document.getElementById("recipient-name").value.trim()
      : "";
    return { email, name, dob, phone, recipientChecked, recipientName };
  }

  function validateBeforeContinue() {
    if (paymentType === "prescription") {
      if (prescriptionItems < 1) {
        return "Choose at least one prescription item.";
      }
    } else {
      if (customAmountPence < CONFIG.MIN_CUSTOM_PENCE) {
        return (
          "Enter an amount of at least " +
          formatGBP(CONFIG.MIN_CUSTOM_PENCE) +
          "."
        );
      }
      if (customAmountPence > CONFIG.MAX_CUSTOM_PENCE) {
        return (
          "Custom amounts above " +
          formatGBP(CONFIG.MAX_CUSTOM_PENCE) +
          " must be paid by calling the pharmacy."
        );
      }
    }

    const info = collectCustomerInfo();
    if (!info.email || !/^\S+@\S+\.\S+$/.test(info.email)) {
      return "Please enter a valid email address.";
    }
    if (!info.name) {
      return "Please enter your full name.";
    }
    if (!info.dob) {
      return "Please enter your date of birth.";
    }
    const dobTs = Date.parse(info.dob);
    if (Number.isNaN(dobTs) || dobTs >= Date.now()) {
      return "Date of birth must be a valid past date.";
    }
    if (!info.phone || info.phone.replace(/\D/g, "").length < 7) {
      return "Please enter a contact phone number.";
    }
    if (info.recipientChecked && !info.recipientName) {
      return "Please enter the patient's name, or untick the box.";
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Stripe flow
  // ---------------------------------------------------------------------------
  async function loadPublishableKey() {
    const res = await fetch("/api/stripe-config");
    if (!res.ok) throw new Error("Could not load Stripe configuration.");
    const data = await res.json();
    if (!data || !data.publishableKey)
      throw new Error("Stripe publishable key is missing.");
    return data.publishableKey;
  }

  async function createPayment() {
    const info = collectCustomerInfo();
    const body = {
      type: paymentType,
      items: paymentType === "prescription" ? prescriptionItems : undefined,
      customAmountPence:
        paymentType === "custom" ? customAmountPence : undefined,
      customer: {
        email: info.email,
        name: info.name,
        dob: info.dob,
        phone: info.phone,
        recipientName: info.recipientChecked ? info.recipientName : "",
      },
    };
    const res = await fetch("/api/create-service-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not create the payment.");
    return data;
  }

  async function startPayment() {
    const error = validateBeforeContinue();
    if (error) {
      showSetupError(error);
      return;
    }
    showSetupError(null);

    const continueBtn = document.getElementById("continue-btn");
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.textContent = "Preparing secure payment...";
    }

    try {
      if (!stripe) {
        stripePublishableKey = await loadPublishableKey();
        if (typeof Stripe === "undefined")
          throw new Error("Stripe.js failed to load.");
        stripe = Stripe(stripePublishableKey);
      }

      const intent = await createPayment();
      activeAmountPence = intent.amountPence;

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

      const amountEl = document.getElementById("payment-step-amount");
      if (amountEl) amountEl.textContent = formatGBP(intent.amountPence);
      const payBtn = document.getElementById("pay-btn");
      if (payBtn) {
        payBtn.querySelector(".pay-btn-label").textContent =
          "Pay " + formatGBP(intent.amountPence);
      }

      const banner = document.getElementById("payment-test-banner");
      if (banner) {
        banner.hidden = !(stripePublishableKey || "").startsWith("pk_test_");
      }

      document.getElementById("setup-card").hidden = true;
      const step = document.getElementById("payment-step-card");
      if (step) {
        step.hidden = false;
        step.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      showSetupError(err && err.message ? err.message : "Something went wrong.");
      if (continueBtn) {
        continueBtn.disabled = false;
        continueBtn.textContent = "Continue to payment";
      }
    }
  }

  function cancelPayment() {
    elements = null;
    activeAmountPence = 0;
    document.getElementById("payment-step-card").hidden = true;
    document.getElementById("setup-card").hidden = false;
    document.getElementById("payment-element").innerHTML = "";
    document.getElementById("address-element").innerHTML = "";
    const continueBtn = document.getElementById("continue-btn");
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent = "Continue to payment";
    }
    document
      .getElementById("setup-card")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitStripePayment(event) {
    event.preventDefault();
    if (!stripe || !elements) return;
    showPaymentError(null);

    const payBtn = document.getElementById("pay-btn");
    if (payBtn) {
      payBtn.setAttribute("aria-busy", "true");
      payBtn.querySelector(".pay-btn-label").textContent = "Processing...";
    }

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + "/success.html",
      },
    });

    if (error) {
      showPaymentError(error.message || "Payment could not be completed.");
      if (payBtn) {
        payBtn.removeAttribute("aria-busy");
        payBtn.querySelector(".pay-btn-label").textContent =
          "Pay " + formatGBP(activeAmountPence);
      }
    }
    // On success Stripe redirects to return_url.
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  document.querySelectorAll(".payment-type-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      paymentType = btn.getAttribute("data-type") || "prescription";
      renderType();
    });
  });

  document
    .getElementById("prescription-counter")
    ?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("[data-counter-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-counter-action");
      if (action === "inc" && prescriptionItems < CONFIG.MAX_PRESCRIPTION_ITEMS) {
        prescriptionItems += 1;
      } else if (action === "dec" && prescriptionItems > 1) {
        prescriptionItems -= 1;
      }
      renderPrescription();
    });

  document
    .getElementById("custom-amount-input")
    ?.addEventListener("input", () => {
      renderCustom();
    });

  document
    .getElementById("recipient-toggle-input")
    ?.addEventListener("change", (event) => {
      const checked = event.target.checked;
      const field = document.getElementById("recipient-field");
      if (field) field.hidden = !checked;
      if (!checked) {
        const input = document.getElementById("recipient-name");
        if (input) input.value = "";
      }
    });

  document
    .getElementById("continue-btn")
    ?.addEventListener("click", () => {
      startPayment();
    });

  document
    .getElementById("back-btn")
    ?.addEventListener("click", cancelPayment);

  document
    .getElementById("stripe-payment-form")
    ?.addEventListener("submit", submitStripePayment);

  // Initial render
  renderType();
  renderPrescription();
  renderCustom();
})();
