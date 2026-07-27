const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function setupBottomNavigationStructure() {
  const navigation = qs(".bottom-nav");
  if (!navigation) return;

  navigation.setAttribute("aria-label", "Navegação principal");
  navigation.innerHTML = `
    <a href="index.html" data-page="home" aria-label="Início">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg>
    </a>
    <a href="loja.html" data-page="loja" aria-label="Loja">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 13H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>
    </a>
    <a href="proximo-evento.html" data-page="proximo-evento" class="next-event-nav" aria-label="Próximo evento">
      <span class="next-event-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="m9 15 2 2 4-5"/></svg></span>
    </a>
    <a href="sobre.html" data-page="sobre" aria-label="O clube">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.5-5 3.2-7 8-7s7.5 2 8 7"/></svg>
    </a>
    <a href="https://www.instagram.com/onlycars.club/" data-page="instagram" aria-label="Instagram do Only Cars Club">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" class="instagram-dot"/></svg>
    </a>
  `;
}

function setActiveNavigation() {
  const page = document.body.dataset.page || "home";
  const navigation = qs(".bottom-nav");
  const links = qsa(".bottom-nav a");
  links.forEach((link) => {
    link.classList.toggle("active", link.dataset.page === page);
  });
  if (!navigation || !links.length) return;
  const activeIndex = Math.max(0, links.findIndex((link) => link.classList.contains("active")));
  navigation.style.setProperty("--nav-index", activeIndex);
  links.forEach((link, index) => link.addEventListener("click", () => {
    navigation.style.setProperty("--nav-index", index);
    links.forEach((item) => item.classList.toggle("active", item === link));
  }));
  setupBottomNavigationDrag(navigation, links, activeIndex);
}

function setupBottomNavigationDrag(navigation, links, activeIndex) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let previewIndex = activeIndex;
  let dragging = false;
  let suppressClick = false;

  const indexAt = (clientX) => {
    const box = navigation.getBoundingClientRect();
    const position = Math.max(0, Math.min(box.width - 1, clientX - box.left));
    return Math.min(links.length - 1, Math.floor(position / (box.width / links.length)));
  };

  const preview = (index) => {
    previewIndex = index;
    navigation.classList.add("nav-dragging");
    links.forEach((link, linkIndex) => {
      link.classList.toggle("nav-drag-active", linkIndex === index);
    });
  };

  const resetPreview = () => {
    navigation.classList.remove("nav-dragging");
    links.forEach((link) => link.classList.remove("nav-drag-active"));
  };

  navigation.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    previewIndex = indexAt(event.clientX);
    dragging = false;
    suppressClick = false;
    navigation.setPointerCapture?.(pointerId);
  });

  navigation.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!dragging && Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY)) {
      dragging = true;
      suppressClick = true;
    }
    if (dragging) preview(indexAt(event.clientX));
  }, { passive:true });

  const finish = (event, cancelled = false) => {
    if (event.pointerId !== pointerId) return;
    const destination = previewIndex;
    const changed = dragging && !cancelled && destination !== activeIndex;
    pointerId = null;
    dragging = false;
    resetPreview();
    if (changed) {
      links.forEach((link, index) => link.classList.toggle("active", index === destination));
      window.setTimeout(() => navigateWithTransition(links[destination].href), 70);
    }
  };

  navigation.addEventListener("pointerup", (event) => finish(event));
  navigation.addEventListener("pointercancel", (event) => finish(event, true));
  navigation.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);
}

function navigateWithTransition(url, replace = false) {
  if (!url) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (replace) location.replace(url);
    else location.href = url;
    return;
  }
  document.body.classList.add("page-leaving");
  window.setTimeout(() => {
    if (replace) location.replace(url);
    else location.href = url;
  }, 260);
}

function setupPageTransitions() {
  document.documentElement.classList.add("motion-enabled");
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("page-ready")));
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    const target = new URL(link.href, location.href);
    if (target.origin !== location.origin || target.pathname === location.pathname && target.search === location.search && target.hash) return;
    event.preventDefault();
    navigateWithTransition(target.href);
  });
  window.addEventListener("pageshow", () => {
    document.body.classList.remove("page-leaving");
    requestAnimationFrame(() => document.body.classList.add("page-ready"));
  });
}

function startTyping() {
  const title = qs(".typed-title");
  if (!title) return;
  const first = "Não é só sobre carros.";
  const second = "Isso é Only.";
  const full = `${first}\n${second}`;
  let length = 0;
  window.clearTimeout(window.onlyTypingTimer);
  title.innerHTML = '<span></span><i class="typing-cursor" aria-hidden="true"></i>';

  const tick = () => {
    length += 1;
    const shown = full.slice(0, length);
    const [lineOne = "", lineTwo = ""] = shown.split("\n");
    title.innerHTML = `<span>${lineOne}</span>${shown.includes("\n") ? `<br><em>${lineTwo}</em>` : ""}<i class="typing-cursor" aria-hidden="true"></i>`;
    if (length < full.length) {
      const character = full[length - 1];
      window.onlyTypingTimer = window.setTimeout(tick, character === "." ? 260 : character === "\n" ? 180 : 48);
    }
  };
  window.onlyTypingTimer = window.setTimeout(tick, 220);
}

function setupTypingReplay() {
  const hero = qs(".hero");
  const join = qs(".join");
  if (!hero) return;
  startTyping();
  let reachedBottom = false;
  if (join) {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) reachedBottom = true;
    }, { threshold: 0.25 }).observe(join);
  }
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && reachedBottom) {
      reachedBottom = false;
      startTyping();
    }
  }, { threshold: 0.55 }).observe(hero);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) startTyping();
  });
}

function setupStats() {
  const stats = qs(".stats");
  if (!stats) return;
  let timers = [];
  let frames = [];
  const stop = () => {
    timers.forEach(clearTimeout);
    frames.forEach(cancelAnimationFrame);
    timers = [];
    frames = [];
  };
  const reset = () => qsa("[data-value]", stats).forEach((item) => {
    item.style.opacity = 0;
    qs("strong", item).textContent = `0${item.dataset.suffix || ""}`;
  });
  const run = () => {
    stop();
    reset();
    const baseDuration = 1850;
    const finishGap = 1000;
    qsa("[data-value]", stats).forEach((item, index) => {
      const value = Number(item.dataset.value);
      const duration = baseDuration + index * finishGap;
      const started = performance.now();
      const animate = (now) => {
        const progress = Math.min((now - started) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        item.style.opacity = eased;
        qs("strong", item).textContent = `${Math.round(value * eased)}${item.dataset.suffix || ""}`;
        if (progress < 1) frames.push(requestAnimationFrame(animate));
      };
      frames.push(requestAnimationFrame(animate));
    });
  };
  reset();
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) run();
    else {
      stop();
      reset();
    }
  }, { threshold: 0.2 }).observe(stats);
}

function setupCarousel() {
  const carousel = qs(".insta-carousel");
  if (!carousel) return;
  const cards = qsa("a", carousel);
  const previous = qs("[data-carousel='previous']");
  const next = qs("[data-carousel='next']");
  const reset = qs("[data-carousel='reset']");
  let active = 0;
  let dragging = false;
  let dragged = false;
  let startX = 0;
  let startScroll = 0;

  const update = () => {
    const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    active = cards.reduce((best, card, index) => {
      const box = card.getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - center) < best.distance
        ? { index, distance: Math.abs(box.left + box.width / 2 - center) }
        : best;
    }, { index: 0, distance: Infinity }).index;
    cards.forEach((card, index) => card.dataset.active = String(index === active));
    if (previous) previous.hidden = active === 0;
    if (next) next.hidden = active === cards.length - 1;
    if (reset) reset.hidden = active !== cards.length - 1;
  };
  const goTo = (index) => {
    const card = cards[Math.max(0, Math.min(index, cards.length - 1))];
    if (!card) return;
    const outer = carousel.getBoundingClientRect();
    const inner = card.getBoundingClientRect();
    carousel.scrollTo({ left: carousel.scrollLeft + inner.left + inner.width / 2 - outer.left - outer.width / 2, behavior: "smooth" });
  };
  carousel.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  carousel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    dragging = true;
    dragged = false;
    startX = event.clientX;
    startScroll = carousel.scrollLeft;
    carousel.setPointerCapture(event.pointerId);
  });
  carousel.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5) dragged = true;
    carousel.scrollLeft = startScroll - distance;
  });
  carousel.addEventListener("pointerup", () => {
    dragging = false;
    window.setTimeout(() => goTo(active), 30);
  });
  cards.forEach((card, index) => card.addEventListener("click", (event) => {
    if (dragged || active !== index) {
      event.preventDefault();
      dragged = false;
      goTo(index);
    }
  }));
  previous?.addEventListener("click", () => goTo(active - 1));
  next?.addEventListener("click", () => goTo(active + 1));
  reset?.addEventListener("click", () => goTo(0));
  window.setTimeout(update, 100);
}

function setupShop() {
  const buttons = qsa(".category-strip [data-category]");
  const cards = qsa(".product-grid .product-card");
  if (!buttons.length || !cards.length) return;
  const title = qs("[data-products-title]");
  const count = qs("[data-products-count]");
  const labels = {
    Todos: "Todos os produtos",
    Roupas: "Roupas",
    Chaveiros: "Chaveiros",
    Adesivos: "Adesivos"
  };
  let category = "Todos";
  const apply = () => {
    let visible = 0;
    cards.forEach((card) => {
      const matchesCategory = category === "Todos" || card.dataset.category === category;
      card.hidden = !matchesCategory;
      if (!card.hidden) visible += 1;
    });
    if (title) title.textContent = labels[category] || category;
    if (count) count.textContent = `${visible} ${visible === 1 ? "item" : "itens"}`;
  };
  buttons.forEach((button) => button.addEventListener("click", () => {
    category = button.dataset.category;
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    apply();
  }));
  apply();
}

function setupProductPage() {
  const form = qs("[data-product-form]");
  if (!form) return;
  const products = {
    "camiseta-oversized": { name:"Camiseta oversized", category:"Roupas · Unissex", price:"R$ 120,00", value:120, description:"Camiseta oversized Only Cars com modelagem ampla e confortável.", sizes:["P","M","G","GG","EG"], variants:["Preto","Branco","Amarelo"], colorOptions:true },
    cropped: { name:"Cropped", category:"Roupas · Feminino", price:"R$ 80,00", value:80, description:"Cropped feminino Only Cars, leve e confortável.", sizes:["P","M","G","GG"], variants:["Preto"], colorOptions:true },
    "camiseta-streetwear": { name:"Camiseta streetwear", category:"Roupas · Unissex", price:"R$ 80,00", value:80, description:"Camiseta streetwear unissex com identidade Only Cars.", sizes:["P","M","G","GG","EG"], variants:["Preto","Branco","Amarelo"], colorOptions:true },
    moletom: { name:"Moletom", category:"Roupas · Unissex", price:"R$ 195,00", value:195, description:"Moletom unissex Only Cars para acompanhar os rolês em qualquer clima.", sizes:["P","M","G","XG"], variants:["Preto"], colorOptions:true },
    "chaveiro-onlynho-1": { name:"Chaveiro Onlynho", category:"Chaveiros · Mascote", price:"R$ 29,90", value:29.9, description:"Chaveiro do mascote Onlynho para levar o clube com você.", sizes:["Único"], variants:["Onlynho 1"] },
    "chaveiro-onlynho-2": { name:"Chaveiro Onlynho 2", category:"Chaveiros · Mascote", price:"R$ 29,90", value:29.9, description:"Segunda versão do chaveiro do mascote Onlynho.", sizes:["Único"], variants:["Onlynho 2"] },
    "chaveiro-onlynho-3": { name:"Chaveiro Onlynho 3", category:"Chaveiros · Mascote", price:"R$ 29,90", value:29.9, description:"Terceira versão do chaveiro do mascote Onlynho.", sizes:["Único"], variants:["Onlynho 3"] },
    "chaveiro-logotipo": { name:"Chaveiro logotipo", category:"Chaveiros · Logotipo", price:"R$ 24,90", value:24.9, description:"Chaveiro com o logotipo oficial do Only Cars Club.", sizes:["Único"], variants:["Preto","Amarelo"] },
    "adesivo-japones": { name:"Adesivo japonês", category:"Adesivos", price:"R$ 9,90", value:9.9, description:"Adesivo japonês Only Cars disponível em três tamanhos.", sizes:["Pequeno","Médio","Grande"], variants:["Branco","Amarelo"], sizePrices:{"Pequeno":9.9,"Médio":14.9,"Grande":19.9} },
    "adesivo-mascote-holografico": { name:"Adesivo mascote holográfico", category:"Adesivos · Mascote", price:"R$ 14,90", value:14.9, description:"Adesivo holográfico do mascote Onlynho em tamanho único.", sizes:["Único"], variants:["Holográfico"] },
    "adesivo-mascote-branco": { name:"Adesivo mascote branco", category:"Adesivos · Mascote", price:"R$ 11,90", value:11.9, description:"Adesivo branco do mascote Onlynho em tamanho único.", sizes:["Único"], variants:["Branco"] }
  };
  const id = new URLSearchParams(location.search).get("id") || "camiseta-oversized";
  const product = products[id] || products["camiseta-oversized"];
  qs("[data-product-name]").textContent = product.name;
  qs("[data-product-category]").textContent = product.category;
  qs("[data-product-price]").textContent = product.price;
  qs("[data-product-description]").textContent = product.description;
  qs("[data-product-image]").alt = product.name;
  document.title = `${product.name} — Only Cars Club`;
  const renderOptions = (target, name, values, swatches = false) => {
    target.classList.toggle("color-options", swatches);
    target.innerHTML = values.map((value, index) => {
      const colorClass = value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const content = swatches
        ? `<span class="color-swatch color-${colorClass}" title="${value}"><span class="sr-only">${value}</span></span>`
        : `<span>${value}</span>`;
      return `<label><input type="radio" name="${name}" value="${value}" aria-label="${value}" ${index === 0 ? "checked" : ""}>${content}</label>`;
    }).join("");
  };
  renderOptions(qs("[data-size-options]"), "size", product.sizes);
  renderOptions(qs("[data-variant-options]"), "variant", product.variants, product.colorOptions);
  if (product.colorOptions) qs("[data-variant-legend]").textContent = "Cor";
  const formatPrice = (value) => value.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
  qsa('input[name="size"]', form).forEach((input) => input.addEventListener("change", () => {
    if (!product.sizePrices) return;
    product.value = product.sizePrices[input.value];
    qs("[data-product-price]").textContent = formatPrice(product.value);
  }));
  const quantity = qs("[data-quantity]");
  qs("[data-quantity-minus]").addEventListener("click", () => quantity.value = Math.max(1, Number(quantity.value) - 1));
  qs("[data-quantity-plus]").addEventListener("click", () => quantity.value = Math.min(99, Number(quantity.value) + 1));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const item = { id, name:product.name, price:product.value, size:new FormData(form).get("size"), variant:new FormData(form).get("variant"), quantity:Number(quantity.value) || 1, image:"assets/images/teste.png" };
    const cart = getCart();
    const existing = cart.find((entry) => entry.id === item.id && entry.size === item.size && entry.variant === item.variant && entry.price === item.price);
    if (existing) existing.quantity += item.quantity;
    else cart.push(item);
    saveCart(cart);
    const feedback = qs("[data-cart-feedback]");
    feedback.textContent = `${item.quantity}x ${product.name} adicionado ao carrinho.`;
    feedback.classList.add("visible");
    showCartToast(item);
  });
}

const formatCurrency = (value) => Number(value).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

function getCart() {
  try {
    const cart = JSON.parse(localStorage.getItem("onlyCarsCart") || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("onlyCarsCart", JSON.stringify(cart));
  if (!cart.length) {
    sessionStorage.removeItem("onlyCarsDelivery");
    sessionStorage.removeItem("onlyCarsCheckoutMaxStep");
  }
  updateCartCount(cart);
}

function setupCheckoutSteps() {
  const steps = qs("[data-checkout-steps]");
  if (!steps) return;
  const current = Number(steps.dataset.currentStep) || 1;
  const previousMax = Number(sessionStorage.getItem("onlyCarsCheckoutMaxStep")) || 1;
  const maxReached = Math.max(current, previousMax);
  sessionStorage.setItem("onlyCarsCheckoutMaxStep", String(maxReached));
  qsa("[data-step]", steps).forEach((item) => {
    const step = Number(item.dataset.step);
    item.classList.toggle("active", step === current);
    item.classList.toggle("done", step < current || (step !== current && step <= maxReached));
    item.classList.toggle("locked", step > maxReached);
    const link = qs("a", item);
    if (link) {
      link.setAttribute("aria-current", step === current ? "step" : "false");
      link.tabIndex = step <= maxReached ? 0 : -1;
    }
  });
}

function updateCartCount(cart = getCart()) {
  const count = cart.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0);
  qsa("[data-cart-count]").forEach((badge) => {
    const previous = Number(badge.dataset.count || count);
    badge.textContent = count;
    badge.dataset.count = String(count);
    badge.hidden = count === 0;
    if (count > previous) {
      badge.classList.remove("count-bump");
      void badge.offsetWidth;
      badge.classList.add("count-bump");
    }
  });
}

function showCartToast(item) {
  const toast = qs("[data-cart-toast]");
  if (!toast) return;
  const text = qs("[data-cart-toast-text]", toast);
  if (text) text.textContent = `${item.quantity} ${item.quantity === 1 ? "item" : "itens"} · ${getCart().reduce((sum, product) => sum + product.quantity, 0)} no carrinho`;
  toast.setAttribute("aria-hidden", "false");
  toast.classList.add("visible");
  window.clearTimeout(window.onlyCartToastTimer);
  window.onlyCartToastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3200);
}

function setupCartPage() {
  const page = qs("[data-cart-page]");
  if (!page) return;
  const empty = qs("[data-cart-empty]", page);
  const layout = qs("[data-cart-layout]", page);
  const items = qs("[data-cart-items]", page);
  const itemCount = qs("[data-cart-items-total]", page);
  const grandTotal = qs("[data-cart-grand-total]", page);
  const confirmRemoval = (allItems = false) => new Promise((resolve) => {
    let modal = qs("[data-confirm-modal]");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "confirm-modal";
      modal.dataset.confirmModal = "";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "confirm-removal-title");
      modal.innerHTML = `
        <div class="confirm-modal-dialog">
          <span class="confirm-modal-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          </span>
          <h2 id="confirm-removal-title" data-confirm-title>Excluir este item?</h2>
          <p data-confirm-text>O produto será retirado do carrinho. Você tem certeza?</p>
          <div class="confirm-modal-actions">
            <button type="button" class="confirm-modal-cancel" data-confirm-cancel>Cancelar</button>
            <button type="button" class="confirm-modal-delete" data-confirm-delete>Excluir</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    const cancel = qs("[data-confirm-cancel]", modal);
    const remove = qs("[data-confirm-delete]", modal);
    qs("[data-confirm-title]", modal).textContent = allItems ? "Limpar o carrinho?" : "Excluir este item?";
    qs("[data-confirm-text]", modal).textContent = allItems ? "Todos os produtos serão retirados do carrinho. Você tem certeza?" : "O produto será retirado do carrinho. Você tem certeza?";
    const close = (answer) => {
      modal.classList.remove("visible");
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeydown);
      window.setTimeout(() => resolve(answer), 180);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };
    cancel.onclick = () => close(false);
    remove.onclick = () => close(true);
    modal.onclick = (event) => {
      if (event.target === modal) close(false);
    };
    document.addEventListener("keydown", onKeydown);
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => {
      modal.classList.add("visible");
      cancel.focus();
    });
  });

  const render = () => {
    const cart = getCart().filter((item) => Number(item.quantity) > 0);
    saveCart(cart);
    const isEmpty = cart.length === 0;
    empty.hidden = !isEmpty;
    layout.hidden = isEmpty;
    if (isEmpty) {
      items.innerHTML = "";
      return;
    }
    items.innerHTML = cart.map((item, index) => `
      <article class="cart-item" data-cart-index="${index}">
        <div class="cart-item-image"><img src="${item.image || "assets/images/teste.png"}" alt="${item.name}"></div>
        <div class="cart-item-info">
          <p>${item.variant || "Padrão"}${item.size ? ` · ${item.size}` : ""}</p>
          <h2>${item.name}</h2>
          <strong>${formatCurrency(item.price)}</strong>
          <button type="button" class="cart-remove" data-cart-remove aria-label="Excluir ${item.name}" title="Excluir item">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
          </button>
        </div>
        <div class="cart-item-actions">
          <span class="quantity-control">
            <button type="button" data-cart-minus aria-label="Diminuir quantidade">−</button>
            <input type="number" min="1" max="99" value="${item.quantity}" data-cart-quantity aria-label="Quantidade de ${item.name}">
            <button type="button" data-cart-plus aria-label="Aumentar quantidade">+</button>
          </span>
          <strong class="cart-item-subtotal">${formatCurrency(item.price * item.quantity)}</strong>
        </div>
      </article>
    `).join("");
    const totalQuantity = cart.reduce((sum, item) => sum + Number(item.quantity), 0);
    const totalValue = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    itemCount.textContent = `${totalQuantity} ${totalQuantity === 1 ? "item" : "itens"}`;
    grandTotal.textContent = formatCurrency(totalValue);
  };

  items.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-cart-index]");
    if (!card) return;
    const index = Number(card.dataset.cartIndex);
    const cart = getCart();
    if (!cart[index]) return;
    const removeButton = event.target.closest("[data-cart-remove]");
    const minusButton = event.target.closest("[data-cart-minus]");
    if (removeButton) {
      if (!await confirmRemoval()) return;
      cart.splice(index, 1);
    }
    else if (minusButton) {
      if (Number(cart[index].quantity) === 1) {
        if (!await confirmRemoval()) return;
        cart.splice(index, 1);
      } else {
        cart[index].quantity = Number(cart[index].quantity) - 1;
      }
    }
    else if (event.target.closest("[data-cart-plus]")) cart[index].quantity = Math.min(99, Number(cart[index].quantity) + 1);
    else return;
    saveCart(cart);
    render();
  });

  items.addEventListener("change", (event) => {
    const input = event.target.closest("[data-cart-quantity]");
    if (!input) return;
    const card = input.closest("[data-cart-index]");
    const cart = getCart();
    const index = Number(card.dataset.cartIndex);
    if (!cart[index]) return;
    cart[index].quantity = Math.max(1, Math.min(99, Number(input.value) || 1));
    saveCart(cart);
    render();
  });

  const clearButton = qs("[data-cart-clear]", page);
  if (clearButton) clearButton.addEventListener("click", async () => {
    if (!await confirmRemoval(true)) return;
    saveCart([]);
    render();
  });

  render();
}

function setupCheckoutFlow() {
  const cart = getCart().filter((item) => Number(item.quantity) > 0);
  const deliveryForm = qs("[data-delivery-form]");
  const paymentForm = qs("[data-payment-form]");
  if (!deliveryForm && !paymentForm) return;
  if (!cart.length) {
    location.replace("carrinho.html");
    return;
  }

  if (deliveryForm) {
    const savedDelivery = sessionStorage.getItem("onlyCarsDelivery");
    const savedInput = savedDelivery && qs(`input[name="delivery"][value="${CSS.escape(savedDelivery)}"]`, deliveryForm);
    if (savedInput) savedInput.checked = true;
    deliveryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = new FormData(deliveryForm).get("delivery");
      if (!selected) {
        qs("[data-checkout-error]", deliveryForm).textContent = "Escolha uma forma de entrega para continuar.";
        return;
      }
      sessionStorage.setItem("onlyCarsDelivery", selected);
      navigateWithTransition("pagamento.html");
    });
  }

  if (paymentForm) {
    const delivery = sessionStorage.getItem("onlyCarsDelivery");
    if (!delivery) {
      location.replace("entrega.html");
      return;
    }
    const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    qs("[data-checkout-total]", paymentForm).textContent = formatCurrency(total);
    paymentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const payment = new FormData(paymentForm).get("payment");
      if (!payment) {
        qs("[data-checkout-error]", paymentForm).textContent = "Escolha uma forma de pagamento para continuar.";
        return;
      }
      const lines = cart.map((item, index) => {
        const details = [
          `*${index + 1}. ${item.name}*${item.variant ? ` - ${item.variant}` : ""}${item.size ? ` - Tamanho: ${item.size}` : ""}`,
          Number(item.quantity) > 1 ? `Quantidade: ${item.quantity}` : "",
          `Valor unitário: ${formatCurrency(item.price)}`,
          Number(item.quantity) > 1 ? `Subtotal: ${formatCurrency(item.price * item.quantity)}` : ""
        ].filter(Boolean);
        return details.join("\n");
      });
      const message = [
        "Olá! Quero finalizar este pedido na *Loja Only Cars Club*.",
        "",
        "*RESUMO DO PEDIDO*",
        lines.join("\n\n"),
        "",
        "*ENTREGA E PAGAMENTO*",
        `Entrega: _${delivery}_`,
        `Pagamento: _${payment}_`,
        "",
        `*TOTAL DOS PRODUTOS: ${formatCurrency(total)}*`,
        payment.startsWith("Cartão") ? "_As taxas do cartão serão confirmadas no atendimento._" : null
      ].filter((line) => line !== null).join("\n");
      window.open(`https://wa.me/5511976842147?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    });
  }
}

function setupLiquidGlass() {
  const selectors = [
    ".bottom-nav",
    ".cart-shortcut",
    ".product-back",
    ".carousel-control",
    ".carousel-reset",
    ".button",
    ".category-strip button",
    ".product-card",
    ".card",
    ".event-item",
    ".product-visual button",
    ".option-list label",
    ".quantity-control",
    ".cart-toast",
    ".cart-item",
    ".cart-summary",
    ".checkout-option",
    ".checkout-order-total",
    ".confirm-modal-dialog",
    ".account-panel"
  ];
  const elements = qsa(selectors.join(","));
  elements.forEach((element) => {
    element.classList.add("liquid-glass");
    element.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const box = element.getBoundingClientRect();
      element.style.setProperty("--glass-x", `${event.clientX - box.left}px`);
      element.style.setProperty("--glass-y", `${event.clientY - box.top}px`);
    }, { passive:true });
    element.addEventListener("pointerleave", () => {
      element.style.setProperty("--glass-x", "50%");
      element.style.setProperty("--glass-y", "50%");
    }, { passive:true });
  });
}

function setupAdminCards() {
  qsa(".admin-card").forEach((card) => {
    const toggle = () => {
      const open = card.classList.toggle("is-open");
      card.setAttribute("aria-pressed", String(open));
      card.setAttribute("aria-label", open
        ? "Ford Escort 1995. Toque para voltar ao perfil de Keven Alves"
        : "Keven Alves, co-fundador. Toque para ver o carro");
    };

    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupPageTransitions();
  setupBottomNavigationStructure();
  setActiveNavigation();
  setupTypingReplay();
  setupStats();
  setupCarousel();
  setupShop();
  setupProductPage();
  setupCartPage();
  setupCheckoutSteps();
  setupCheckoutFlow();
  setupAdminCards();
  setupLiquidGlass();
  updateCartCount();
});
