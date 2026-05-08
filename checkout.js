(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Mock product catalogue. Mirrors api/create-payment-intent.js until we move
  // to a database. Prices are pence so we never round-trip through floats.
  // The server is the source of truth -- the client only sends { id, qty }.
  // ---------------------------------------------------------------------------
  const MOCK_PRODUCTS = [
    {
      id: "vitamin-d3-1000iu-60",
      name: "Vitamin D3 1000iu Tablets",
      size: "60 tablets",
      pricePence: 899,
      image: "./assets/images/popular-product-images/popular-vitamin-d3.png",
    },
    {
      id: "omega-3-high-strength-30",
      name: "Omega 3 High Strength Softgels",
      size: "30 softgels",
      pricePence: 1250,
      image: "./assets/images/popular-product-images/popular-omega-3..png",
    },
    {
      id: "hayfever-relief-30",
      name: "Hayfever Relief Tablets",
      size: "30 tablets",
      pricePence: 725,
      image: "./assets/images/popular-product-images/popular-hayfever-relief.png",
    },
    {
      id: "sensitive-skin-balm-50ml",
      name: "Sensitive Skin Daily Care Balm",
      size: "50ml",
      pricePence: 975,
      image: "./assets/images/popular-product-images/popular-sensitive-skin-balm.png",
    },
    {
      id: "daily-multivitamin-60",
      name: "Daily Multivitamin Capsules",
      size: "60 capsules",
      pricePence: 650,
      image: "./assets/images/capsule-pill.png",
    },
    {
      id: "paracetamol-500-32",
      name: "Paracetamol 500mg Tablets",
      size: "32 tablets",
      pricePence: 240,
      image: "./assets/images/capsule-pill.png",
    },
    {
      id: "travel-first-aid",
      name: "Travel First Aid Kit",
      size: "1 kit",
      pricePence: 1499,
      image: "./assets/images/suitcase.png",
    },
    {
      id: "baby-bath-foam-250",
      name: "Baby Soothing Bath Foam",
      size: "250ml",
      pricePence: 595,
      image: "./assets/images/rubber-duck.png",
    },
  ];

  const FREE_DELIVERY_THRESHOLD_PENCE = 2500;
  const STANDARD_DELIVERY_PENCE = 295;
  const STORAGE_KEY = "fiveways_cart_v1";

  // ---------------------------------------------------------------------------
  // Cart state
  // ---------------------------------------------------------------------------
  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (err) {
      // localStorage might be unavailable; fail silently.
    }
  }

  let cart = loadCart();

  // Stripe state for the active payment session.
  let stripe = null;
  let stripePublishableKey = null;
  let elements = null;
  let paymentIntentClientSecret = null;
  let isPaymentStepOpen = false;

  function addToCart(productId) {
    cart[productId] = (cart[productId] || 0) + 1;
    saveCart(cart);
    render();
  }

  function setQty(productId, qty) {
    if (qty <= 0) {
      delete cart[productId];
    } else {
      cart[productId] = qty;
    }
    saveCart(cart);
    render();
  }

  function removeFromCart(productId) {
    delete cart[productId];
    saveCart(cart);
    render();
  }

  function clearCart() {
    cart = {};
    saveCart(cart);
    render();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatGBP(pence) {
    return "GBP " + (pence / 100).toFixed(2);
  }

  function findProduct(id) {
    return MOCK_PRODUCTS.find((p) => p.id === id);
  }

  function cartLines() {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = findProduct(id);
        if (!product) return null;
        return { product, qty };
      })
      .filter(Boolean);
  }

  function totals() {
    const lines = cartLines();
    const subtotal = lines.reduce(
      (sum, { product, qty }) => sum + product.pricePence * qty,
      0
    );
    const itemCount = lines.reduce((sum, { qty }) => sum + qty, 0);
    const delivery =
      subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD_PENCE
        ? 0
        : STANDARD_DELIVERY_PENCE;
    return {
      subtotal,
      delivery,
      total: subtotal + delivery,
      itemCount,
      remainingForFreeDelivery: Math.max(
        0,
        FREE_DELIVERY_THRESHOLD_PENCE - subtotal
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Rendering (cart + summary + mock rail)
  // ---------------------------------------------------------------------------
  function renderMockRail() {
    const rail = document.getElementById("mock-product-rail");
    if (!rail) return;
    rail.innerHTML = MOCK_PRODUCTS.map((p) => {
      const inCart = !!cart[p.id];
      return `
        <article class="mock-product">
          <div class="mock-product-image">
            <img src="${p.image}" alt="" loading="lazy" />
          </div>
          <p class="mock-product-name">${p.name}</p>
          <p class="mock-product-size">${p.size}</p>
          <div class="mock-product-meta">
            <p class="mock-product-price">${formatGBP(p.pricePence)}</p>
            <button
              type="button"
              class="mock-add-btn ${inCart ? "is-added" : ""}"
              data-add-id="${p.id}"
              aria-label="Add ${p.name} to basket"
            >
              ${inCart ? "Added (+1)" : "Add"}
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderCartLines() {
    const lines = cartLines();
    const empty = document.getElementById("cart-empty");
    const list = document.getElementById("cart-lines");
    const countEl = document.querySelector("[data-cart-line-count]");
    const pillCount = document.querySelector("[data-cart-count]");

    const itemCount = lines.reduce((sum, { qty }) => sum + qty, 0);
    if (countEl) {
      countEl.textContent = itemCount === 1 ? "1 item" : itemCount + " items";
    }
    if (pillCount) {
      pillCount.textContent = String(itemCount);
    }

    if (lines.length === 0) {
      if (empty) empty.hidden = false;
      if (list) list.innerHTML = "";
      return;
    }

    if (empty) empty.hidden = true;
    if (!list) return;

    list.innerHTML = lines
      .map(({ product, qty }) => {
        const lineTotal = product.pricePence * qty;
        return `
          <li class="cart-line" data-line-id="${product.id}">
            <div class="cart-line-image">
              <img src="${product.image}" alt="" loading="lazy" />
            </div>
            <div class="cart-line-info">
              <p class="cart-line-name">${product.name}</p>
              <p class="cart-line-size">${product.size}</p>
              <div class="cart-line-controls">
                <div class="qty-control">
                  <button type="button" data-qty-action="dec" data-id="${product.id}" aria-label="Decrease quantity">-</button>
                  <span class="qty-value">${qty}</span>
                  <button type="button" data-qty-action="inc" data-id="${product.id}" aria-label="Increase quantity">+</button>
                </div>
                <button type="button" class="cart-line-remove" data-remove-id="${product.id}">Remove</button>
              </div>
            </div>
            <div class="cart-line-price">
              <span>${formatGBP(lineTotal)}</span>
              ${qty > 1 ? `<span class="cart-line-price-each">${formatGBP(product.pricePence)} each</span>` : ""}
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderSummary() {
    const t = totals();
    const subtotalEl = document.getElementById("summary-subtotal");
    const deliveryEl = document.getElementById("summary-delivery");
    const totalEl = document.getElementById("summary-total");
    const noteEl = document.getElementById("summary-delivery-note");
    const proceedBtn = document.getElementById("proceed-btn");

    if (subtotalEl) subtotalEl.textContent = formatGBP(t.subtotal);
    if (deliveryEl) {
      deliveryEl.textContent = t.delivery === 0 ? "FREE" : formatGBP(t.delivery);
    }
    if (totalEl) totalEl.textContent = formatGBP(t.total);

    if (noteEl) {
      if (t.subtotal === 0) {
        noteEl.textContent = "Add items to see delivery details.";
      } else if (t.remainingForFreeDelivery === 0) {
        noteEl.textContent = "You qualify for free next-day delivery.";
      } else {
        noteEl.textContent =
          "Add " +
          formatGBP(t.remainingForFreeDelivery) +
          " more for free next-day delivery.";
      }
    }

    if (proceedBtn) {
      proceedBtn.disabled = t.itemCount === 0 || isPaymentStepOpen;
    }
  }

  function render() {
    renderMockRail();
    renderCartLines();
    renderSummary();
  }

  // ---------------------------------------------------------------------------
  // Stripe payment flow
  // ---------------------------------------------------------------------------
  function setLockedState(locked) {
    document
      .getElementById("cart-lines")
      ?.closest(".cart-list")
      ?.classList.toggle("is-locked", locked);
    document
      .querySelector(".mock-add-panel")
      ?.classList.toggle("is-locked", locked);
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

  async function loadPublishableKey() {
    const res = await fetch("/api/stripe-config");
    if (!res.ok) {
      throw new Error("Could not load Stripe configuration.");
    }
    const data = await res.json();
    if (!data || !data.publishableKey) {
      throw new Error("Stripe publishable key missing from server response.");
    }
    return data.publishableKey;
  }

  async function createPaymentIntent() {
    const items = Object.entries(cart).map(([id, qty]) => ({ id, qty }));
    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not create the payment.");
    }
    return data;
  }

  async function startPayment() {
    const t = totals();
    if (t.itemCount === 0) return;

    const proceedBtn = document.getElementById("proceed-btn");
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.textContent = "Preparing payment...";
    }

    try {
      if (!stripe) {
        stripePublishableKey = await loadPublishableKey();
        if (typeof Stripe === "undefined") {
          throw new Error("Stripe.js failed to load.");
        }
        stripe = Stripe(stripePublishableKey);
      }

      const intent = await createPaymentIntent();
      paymentIntentClientSecret = intent.clientSecret;

      elements = stripe.elements({
        clientSecret: paymentIntentClientSecret,
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
        mode: "shipping",
        allowedCountries: ["GB"],
      });
      addressElement.mount("#address-element");

      const paymentElement = elements.create("payment", {
        layout: { type: "tabs" },
      });
      paymentElement.mount("#payment-element");

      const totalEl = document.getElementById("payment-total");
      if (totalEl) totalEl.textContent = formatGBP(intent.amountPence);
      const payBtn = document.getElementById("pay-btn");
      if (payBtn) {
        payBtn.querySelector(".pay-btn-label").textContent =
          "Pay " + formatGBP(intent.amountPence);
      }

      const testBanner = document.getElementById("payment-test-banner");
      if (testBanner) {
        // Show the test banner whenever we are using a pk_test_ key.
        const isTest = (stripePublishableKey || "").startsWith("pk_test_");
        testBanner.hidden = !isTest;
      }

      isPaymentStepOpen = true;
      setLockedState(true);
      const paymentStep = document.getElementById("payment-step");
      if (paymentStep) {
        paymentStep.hidden = false;
        paymentStep.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      const summaryCta = document.getElementById("proceed-btn");
      if (summaryCta) summaryCta.classList.add("is-hidden");
      showError(null);
    } catch (err) {
      showError(err && err.message ? err.message : "Something went wrong.");
      if (proceedBtn) {
        proceedBtn.disabled = false;
        proceedBtn.textContent = "Continue to payment";
      }
    }
  }

  function cancelPayment() {
    isPaymentStepOpen = false;
    setLockedState(false);
    paymentIntentClientSecret = null;
    elements = null;

    const paymentStep = document.getElementById("payment-step");
    if (paymentStep) paymentStep.hidden = true;

    const proceedBtn = document.getElementById("proceed-btn");
    if (proceedBtn) {
      proceedBtn.classList.remove("is-hidden");
      proceedBtn.disabled = false;
      proceedBtn.textContent = "Continue to payment";
    }

    document.getElementById("payment-element").innerHTML = "";
    document.getElementById("address-element").innerHTML = "";

    const cartList = document.querySelector(".cart-list");
    if (cartList) {
      cartList.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (!stripe || !elements) return;

    const emailInput = document.getElementById("payment-email");
    const email = emailInput ? emailInput.value.trim() : "";
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      showError("Please enter a valid email address.");
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
        payBtn.querySelector(".pay-btn-label").textContent = "Pay now";
      }
    }
    // If no error, Stripe will have redirected to the return_url.
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (isPaymentStepOpen) {
      // While paying, ignore basket-level interactions.
      if (target.closest(".cart-list") || target.closest(".mock-add-panel")) {
        return;
      }
    }

    const addBtn = target.closest("[data-add-id]");
    if (addBtn) {
      addToCart(addBtn.getAttribute("data-add-id"));
      return;
    }

    const qtyBtn = target.closest("[data-qty-action]");
    if (qtyBtn) {
      const id = qtyBtn.getAttribute("data-id");
      const action = qtyBtn.getAttribute("data-qty-action");
      const current = cart[id] || 0;
      if (action === "inc") setQty(id, current + 1);
      else if (action === "dec") setQty(id, current - 1);
      return;
    }

    const removeBtn = target.closest("[data-remove-id]");
    if (removeBtn) {
      removeFromCart(removeBtn.getAttribute("data-remove-id"));
      return;
    }
  });

  document.getElementById("clear-cart-btn")?.addEventListener("click", () => {
    if (Object.keys(cart).length === 0) return;
    clearCart();
  });

  document.getElementById("proceed-btn")?.addEventListener("click", () => {
    startPayment();
  });

  document.getElementById("back-to-cart")?.addEventListener("click", () => {
    cancelPayment();
  });

  document.getElementById("payment-form")?.addEventListener("submit", submitPayment);

  render();
})();
