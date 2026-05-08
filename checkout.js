(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Mock product catalogue. Prices are in pence (integer) to avoid floating
  // point drift. When we wire up Stripe, each product id should map 1:1 to a
  // Stripe Price id so the backend can re-price the basket server-side.
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
  // Cart state. Stored as { [productId]: quantity } in localStorage so the
  // basket survives reloads.
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
  // Rendering
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
      countEl.textContent =
        itemCount === 1 ? "1 item" : itemCount + " items";
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
      deliveryEl.textContent =
        t.delivery === 0 ? "FREE" : formatGBP(t.delivery);
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
      proceedBtn.disabled = t.itemCount === 0;
    }
  }

  function render() {
    renderMockRail();
    renderCartLines();
    renderSummary();
  }

  // ---------------------------------------------------------------------------
  // Event wiring (delegated where possible to keep things simple).
  // ---------------------------------------------------------------------------
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

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

  const clearBtn = document.getElementById("clear-cart-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (Object.keys(cart).length === 0) return;
      clearCart();
    });
  }

  const proceedBtn = document.getElementById("proceed-btn");
  if (proceedBtn) {
    proceedBtn.addEventListener("click", () => {
      const t = totals();
      const status = document.getElementById("summary-status");
      if (!status) return;
      status.hidden = false;
      status.textContent =
        "Stripe checkout will be wired up here. Total to charge: " +
        formatGBP(t.total) +
        ".";
    });
  }

  render();
})();
