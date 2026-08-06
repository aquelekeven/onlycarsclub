const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const PRODUCT_IMAGE_VERSION = "20260729-v59";
const productImage = (key, extension = "webp") =>
  `assets/images/${key}.${extension}?v=${PRODUCT_IMAGE_VERSION}`;
const PROMOTION_DISCOUNT_RATE = 0.1;
const MOLETOM_GIFT_OPTIONS = Object.freeze([
  "Japonês P",
  "Japonês M",
  "Japonês G",
  "Mascote colorido",
  "Mascote branco",
  "Mascote holográfico"
]);

const PRODUCT_CATALOG = Object.freeze({
  "camiseta-oversized": Object.freeze({
    name:"Camiseta oversized",
    category:"Roupas · Unissex",
    price:"R$ 120,00",
    value:120,
    weightGrams:320,
    shippingPackage:Object.freeze({ length:30, width:20, height:8 }),
    description:"Camiseta oversized Only Cars, com modelagem ampla e confortável.",
    sizes:Object.freeze(["P","M","G","GG","EG"]),
    variants:Object.freeze(["Preto"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("camiseta-oversized-frente-modelo"),
      productImage("camiseta-oversized-costas-modelo"),
      productImage("camiseta-oversized-frente"),
      productImage("camiseta-oversized-costas")
    ]),
    imageAlts:Object.freeze([
      "Camiseta oversized preta Only Cars, vista frontal com modelo",
      "Camiseta oversized preta Only Cars, vista traseira com modelo",
      "Camiseta oversized preta Only Cars, vista frontal",
      "Camiseta oversized preta Only Cars, vista traseira"
    ]),
    variantImageIndices:Object.freeze({ Preto:0 })
  }),
  cropped: Object.freeze({
    name:"Cropped",
    category:"Roupas · Feminino",
    price:"R$ 80,00",
    value:80,
    description:"Cropped preto Only Cars, com modelagem ampla e estampa do Onlynho nas costas.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["Preto"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("cropped-v53-frente", "png"),
      productImage("cropped-v53-costas", "png")
    ]),
    imageAlts:Object.freeze([
      "Cropped preto Only Cars, vista frontal com modelo",
      "Cropped preto Only Cars, vista traseira com modelo"
    ])
  }),
  moletom: Object.freeze({
    name:"Moletom",
    category:"Roupas · Unissex",
    price:"R$ 195,00",
    value:195,
    weightGrams:600,
    shippingPackage:Object.freeze({ length:30, width:20, height:8 }),
    description:"Moletom preto unissex Only Cars para acompanhar os rolês em qualquer clima.",
    sizes:Object.freeze(["P","M","G","XG"]),
    variants:Object.freeze(["Preto"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("moletom-v51-frente-modelo"),
      productImage("moletom-v51-costas-modelo"),
      productImage("moletom-v51-frente"),
      productImage("moletom-v51-costas")
    ]),
    imageAlts:Object.freeze([
      "Moletom preto Only Cars, vista frontal com modelo",
      "Moletom preto Only Cars, vista traseira com modelo",
      "Moletom preto Only Cars, vista frontal",
      "Moletom preto Only Cars, vista traseira"
    ])
  }),
  "chaveiro-logotipo": Object.freeze({
    name:"Chaveiro logotipo",
    category:"Chaveiros · Logotipo",
    price:"R$ 15,00",
    value:15,
    description:"Chaveiro com o logotipo oficial do Only Cars Club, disponível em branco ou preto.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["Branco","Preto"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("chaveiro-logo-branco"),
      productImage("chaveiro-logo-preto")
    ]),
    imageAlts:Object.freeze([
      "Chaveiro com logotipo branco do Only Cars Club",
      "Chaveiro com logotipo preto do Only Cars Club"
    ]),
    variantImageIndices:Object.freeze({ Branco:0, Preto:1 })
  }),
  "chaveiro-onlynho-1": Object.freeze({
    name:"Chaveiro mascote resina",
    category:"Chaveiros · Mascote",
    price:"R$ 25,00",
    value:25,
    description:"Chaveiro de resina com o mascote Onlynho para levar o clube com você.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["Resina"]),
    images:Object.freeze([
      productImage("chaveiro-onlynho-1-frente"),
      productImage("chaveiro-onlynho-1-costas")
    ]),
    imageAlts:Object.freeze([
      "Chaveiro mascote em resina, vista frontal",
      "Chaveiro mascote em resina, vista traseira"
    ])
  }),
  "chaveiro-onlynho-2": Object.freeze({
    name:"Chaveiro mascote 3D",
    category:"Chaveiros · Mascote",
    price:"R$ 15,00",
    value:15,
    description:"Chaveiro 3D com o mascote Onlynho para levar o clube com você.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["3D"]),
    images:Object.freeze([
      productImage("chaveiro-onlynho-2-frente"),
      productImage("chaveiro-onlynho-2-costas")
    ]),
    imageAlts:Object.freeze([
      "Chaveiro mascote 3D, vista frontal",
      "Chaveiro mascote 3D, vista traseira"
    ])
  }),
  "copo-termico": Object.freeze({
    name:"Copo térmico Only",
    category:"Acessórios · Copos",
    price:"R$ 75,00",
    value:75,
    description:"Copo térmico do Only Cars Club para acompanhar encontros, viagens e o dia a dia.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["Preto"]),
    colorOptions:true,
    images:Object.freeze([productImage("copo-termico-v53", "png")]),
    imageAlts:Object.freeze(["Copo térmico preto Only Cars com gravação a laser"])
  }),
  "camiseta-oversized-amarela": Object.freeze({
    name:"Camiseta oversized amarela",
    category:"Roupas · Unissex",
    price:"R$ 120,00",
    value:120,
    weightGrams:320,
    shippingPackage:Object.freeze({ length:30, width:20, height:8 }),
    description:"Camiseta oversized amarela com estampa exclusiva Only Cars.",
    sizes:Object.freeze(["P","M","G","GG","EG"]),
    variants:Object.freeze(["Amarelo"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("oversized-amarela-frente-v54", "png"),
      productImage("oversized-amarela-costas-v54", "png")
    ]),
    imageAlts:Object.freeze([
      "Camiseta oversized amarela Only Cars, vista frontal",
      "Camiseta oversized amarela Only Cars, vista traseira"
    ])
  }),
  "camiseta-streetwear": Object.freeze({
    name:"Camiseta streetwear",
    category:"Roupas · Unissex",
    price:"R$ 80,00",
    value:80,
    weightGrams:250,
    shippingPackage:Object.freeze({ length:30, width:20, height:8 }),
    description:"Camiseta streetwear Only Cars, disponível nas cores preta, amarela e branca.",
    sizes:Object.freeze(["P","M","G","GG","EG"]),
    variants:Object.freeze(["Preto","Amarelo","Branco"]),
    colorOptions:true,
    images:Object.freeze([
      productImage("streetwear-preta-frente-v52", "png"),
      productImage("streetwear-preta-verso-v52", "png")
    ]),
    imageAlts:Object.freeze([
      "Camiseta streetwear preta Only Cars, vista frontal",
      "Camiseta streetwear preta Only Cars, vista traseira"
    ]),
    variantImages:Object.freeze({
      Preto:Object.freeze([
        productImage("streetwear-preta-frente-v52", "png"),
        productImage("streetwear-preta-verso-v52", "png")
      ]),
      Amarelo:Object.freeze([
        productImage("streetwear-amarela-frente-v52", "png"),
        productImage("streetwear-amarela-verso-v52", "png")
      ]),
      Branco:Object.freeze([
        productImage("streetwear-branca-frente-v52", "png"),
        productImage("streetwear-branca-verso-v52", "png")
      ])
    }),
    variantImageAlts:Object.freeze({
      Preto:Object.freeze([
        "Camiseta streetwear preta Only Cars, vista frontal",
        "Camiseta streetwear preta Only Cars, vista traseira"
      ]),
      Amarelo:Object.freeze([
        "Camiseta streetwear amarela Only Cars, vista frontal",
        "Camiseta streetwear amarela Only Cars, vista traseira"
      ]),
      Branco:Object.freeze([
        "Camiseta streetwear branca Only Cars, vista frontal",
        "Camiseta streetwear branca Only Cars, vista traseira"
      ])
    })
  }),
  "adesivo-japones-p": Object.freeze({
    name:"Adesivo japonês P",
    category:"Adesivos · Japonês",
    price:"R$ 15,00",
    value:15,
    description:"Adesivo japonês Only Cars no tamanho P, com 15 × 3,5 cm.",
    sizes:Object.freeze(["P"]),
    variants:Object.freeze(["Padrão"]),
    images:Object.freeze([productImage("adesivo-japones-p-v55", "png")]),
    imageAlts:Object.freeze(["Adesivo japonês Only Cars tamanho P, 15 × 3,5 cm"])
  }),
  "adesivo-japones-m": Object.freeze({
    name:"Adesivo japonês M",
    category:"Adesivos · Japonês",
    price:"R$ 20,00",
    value:20,
    description:"Adesivo japonês Only Cars no tamanho M, com 31 × 7 cm.",
    sizes:Object.freeze(["M"]),
    variants:Object.freeze(["Padrão"]),
    images:Object.freeze([productImage("adesivo-japones-m-v55", "png")]),
    imageAlts:Object.freeze(["Adesivo japonês Only Cars tamanho M, 31 × 7 cm"])
  }),
  "adesivo-japones-g": Object.freeze({
    name:"Adesivo japonês G",
    category:"Adesivos · Japonês",
    price:"R$ 25,00",
    value:25,
    description:"Adesivo japonês Only Cars no tamanho G, com 53 × 11 cm.",
    sizes:Object.freeze(["G"]),
    variants:Object.freeze(["Padrão"]),
    images:Object.freeze([productImage("adesivo-japones-g-v55", "png")]),
    imageAlts:Object.freeze(["Adesivo japonês Only Cars tamanho G, 53 × 11 cm"])
  }),
  "adesivo-mascote": Object.freeze({
    name:"Adesivo mascote",
    category:"Adesivos · Mascote",
    price:"A partir de R$ 15,00",
    value:15,
    description:"Adesivo do mascote Onlynho, disponível em acabamento colorido ou branco.",
    sizes:Object.freeze(["Único"]),
    variants:Object.freeze(["Colorido","Branco"]),
    colorOptions:true,
    variantPrices:Object.freeze({ Colorido:15, Branco:15 }),
    images:Object.freeze([productImage("adesivo-mascote-colorido-v59", "png")]),
    imageAlts:Object.freeze(["Adesivos coloridos do mascote Onlynho"]),
    variantImages:Object.freeze({
      Colorido:Object.freeze([productImage("adesivo-mascote-colorido-v59", "png")]),
      Branco:Object.freeze([productImage("adesivo-mascote-branco-v59", "png")])
    }),
    variantImageAlts:Object.freeze({
      Colorido:Object.freeze(["Adesivos coloridos do mascote Onlynho"]),
      Branco:Object.freeze(["Adesivos brancos de recorte do mascote Onlynho com máscara de aplicação"])
    })
  })
});

const getProductGallery = (product, variant = product.variants?.[0]) => ({
  images:product.variantImages?.[variant] || product.images || ["assets/images/placeholder.webp"],
  alts:product.variantImageAlts?.[variant] || product.imageAlts || []
});

const getOriginalCatalogPrice = (product, size, variant) => {
  const candidate = product.variantPrices?.[variant] ?? product.sizePrices?.[size] ?? product.value;
  return Number.isFinite(Number(candidate)) ? Number(candidate) : 0;
};

const getCatalogPrice = (product, size, variant) =>
  Math.round(getOriginalCatalogPrice(product, size, variant) * (1 - PROMOTION_DISCOUNT_RATE) * 100) / 100;

const publicInventory = { promise:null };
const inventoryKey = (productId, size, variant) => [productId, size || "", variant || ""].join("\u0000");

async function loadPublicInventory(force = false) {
  if (force) publicInventory.promise = null;
  if (publicInventory.promise) return publicInventory.promise;
  publicInventory.promise = (async () => {
    if (!window.OnlySupabase?.publicRest) throw new Error("Catálogo indisponível.");
    const products = await window.OnlySupabase.publicRest(
      "products?select=slug,product_variants(size,color,stock_quantity,reserved_quantity,active)&active=eq.true"
    );
    const variants = new Map();
    (products || []).forEach((product) => {
      (product.product_variants || []).filter((variant) => variant.active).forEach((variant) => {
        const available = Math.max(0, Number(variant.stock_quantity || 0) - Number(variant.reserved_quantity || 0));
        variants.set(inventoryKey(product.slug, variant.size, variant.color), available);
      });
    });
    return variants;
  })().catch((error) => {
    publicInventory.promise = null;
    throw error;
  });
  return publicInventory.promise;
}

function watchPublicInventory(render) {
  const refresh = () => loadPublicInventory(true).then(render).catch(() => render(null));
  const timer = window.setInterval(() => {
    if (!document.hidden) refresh();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener("pagehide", () => window.clearInterval(timer), { once:true });
}

function normalizeCartItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object" || typeof rawItem.id !== "string") return null;
  const product = PRODUCT_CATALOG[rawItem.id];
  if (!product || product.unavailable) return null;
  const size = product.sizes.includes(rawItem.size) ? rawItem.size : product.sizes[0];
  const variant = product.variants.includes(rawItem.variant) ? rawItem.variant : product.variants[0];
  const quantity = Math.max(1, Math.min(99, Math.trunc(Number(rawItem.quantity) || 1)));
  const gallery = getProductGallery(product, variant);
  const imageIndex = product.variantImageIndices?.[variant] ?? 0;
  const gift = rawItem.id === "moletom" && MOLETOM_GIFT_OPTIONS.includes(rawItem.gift)
    ? rawItem.gift
    : null;
  return {
    id:rawItem.id,
    name:product.name,
    price:getCatalogPrice(product, size, variant),
    size,
    variant,
    quantity,
    gift,
    weightGrams:Number(product.weightGrams) || 0,
    shippingEligible:Boolean(product.shippingPackage && product.weightGrams),
    pickupOnly:/^(Chaveiros|Adesivos)/.test(product.category),
    image:gallery.images[imageIndex] || gallery.images[0] || "assets/images/placeholder.webp"
  };
}

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
    <a href="https://www.instagram.com/onlycars.club/" data-page="instagram" aria-label="Instagram do Only Cars Club" target="_blank" rel="noopener noreferrer">
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
    // O arraste entre abas é uma interação exclusiva de toque.
    // Capturar o ponteiro do mouse no desktop pode transformar um clique
    // normal em gesto e impedir a navegação do link.
    if (event.pointerType !== "touch") return;
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
  if (replace) location.replace(url);
  else location.href = url;
}

function setupPageTransitions() {
  document.documentElement.classList.remove("motion-enabled");
  document.body.classList.remove("page-ready", "page-leaving");
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
  let dragPointerId = null;

  const setActive = (index) => {
    active = Math.max(0, Math.min(index, cards.length - 1));
    cards.forEach((card, cardIndex) => card.dataset.active = String(cardIndex === active));
    if (previous) previous.hidden = active === 0;
    if (next) next.hidden = active === cards.length - 1;
    if (reset) reset.hidden = active !== cards.length - 1;
  };
  const update = () => {
    const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    const centeredIndex = cards.reduce((best, card, index) => {
      const box = card.getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - center) < best.distance
        ? { index, distance: Math.abs(box.left + box.width / 2 - center) }
        : best;
    }, { index: 0, distance: Infinity }).index;
    setActive(centeredIndex);
  };
  const goTo = (index) => {
    const targetIndex = Math.max(0, Math.min(index, cards.length - 1));
    const card = cards[targetIndex];
    if (!card) return;
    setActive(targetIndex);
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
    dragPointerId = event.pointerId;
  });
  carousel.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) > 5 && !dragged) {
      dragged = true;
      carousel.setPointerCapture?.(event.pointerId);
    }
    carousel.scrollLeft = startScroll - distance;
  });
  carousel.addEventListener("pointerup", () => {
    dragging = false;
    if (dragPointerId !== null && carousel.hasPointerCapture?.(dragPointerId)) carousel.releasePointerCapture(dragPointerId);
    dragPointerId = null;
    window.setTimeout(() => goTo(active), 30);
  });
  carousel.addEventListener("pointercancel", () => {
    dragging = false;
    dragPointerId = null;
  });
  cards.forEach((card, index) => card.addEventListener("click", (event) => {
    const isHighlighted = card.dataset.active === "true";
    if (dragged || !isHighlighted) {
      event.preventDefault();
      event.stopPropagation();
      dragged = false;
      goTo(index);
    }
  }, true));
  previous?.addEventListener("click", () => goTo(active - 1));
  next?.addEventListener("click", () => goTo(active + 1));
  reset?.addEventListener("click", () => goTo(0));
  window.setTimeout(update, 100);
}

function setupShop() {
  const buttons = qsa(".category-strip [data-category]");
  const cards = qsa(".product-grid .product-card");
  if (!buttons.length || !cards.length) return;
  qsa("[data-product-image-key]").forEach((image) => {
    image.src = productImage(image.dataset.productImageKey, image.dataset.productImageExtension || "webp");
  });

  const colorNames = {
    Preto:"#111111",
    Branco:"#f5f5f1",
    Amarelo:"#ffd41f",
    Colorido:"linear-gradient(135deg,#ffd41f 0 33%,#eb3838 33% 66%,#2684ff 66%)"
  };

  const uniqueEntries = (entries) => entries.filter((entry, index, list) =>
    list.findIndex((candidate) => candidate.src === entry.src) === index
  );

  const getCardGallery = (product) => {
    if (product.variantImages) {
      return uniqueEntries(product.variants.flatMap((variant) => {
        const images = product.variantImages[variant] || [];
        const alts = product.variantImageAlts?.[variant] || [];
        return images.map((src, index) => ({ src, alt:alts[index] || product.name, variant }));
      }));
    }
    return uniqueEntries((product.images || []).map((src, index) => ({
      src,
      alt:product.imageAlts?.[index] || product.name,
      variant:product.variants.find((variant) => product.variantImageIndices?.[variant] === index) || product.variants[0]
    })));
  };

  cards.forEach((card) => {
    const href = card.getAttribute("href") || "";
    const id = new URL(href, location.href).searchParams.get("id");
    const product = PRODUCT_CATALOG[id];
    const visual = qs(".product-visual", card);
    const image = qs(".product-photo", visual);
    const copy = qs(".product-copy", card);
    if (!product || !visual || !image || !copy) return;
    card.dataset.productId = id;

    const availability = document.createElement("span");
    availability.className = "product-card-availability loading";
    availability.textContent = "Consultando disponibilidade";
    availability.setAttribute("aria-live", "polite");
    copy.appendChild(availability);

    const entries = getCardGallery(product);
    if (!entries.length) return;
    let currentIndex = 0;
    let pointerStartX = null;
    let pointerId = null;
    let suppressNextClick = false;

    const dots = document.createElement("div");
    dots.className = "product-gallery-dots";
    dots.setAttribute("aria-hidden", "true");
    entries.forEach(() => dots.appendChild(document.createElement("i")));

    const renderImage = (index) => {
      currentIndex = (index + entries.length) % entries.length;
      const entry = entries[currentIndex];
      image.src = entry.src;
      image.alt = entry.alt;
      qsa("i", dots).forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === currentIndex));
      qsa("[data-card-variant]", card).forEach((swatch) => {
        const selected = swatch.dataset.cardVariant === entry.variant;
        swatch.classList.toggle("active", selected);
        swatch.setAttribute("aria-pressed", String(selected));
      });
    };

    if (entries.length > 1) {
      visual.classList.add("has-card-gallery");
      visual.append(dots);
      image.draggable = false;
      image.addEventListener("dragstart", (event) => event.preventDefault());
      visual.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        pointerStartX = event.clientX;
        pointerId = event.pointerId;
        visual.setPointerCapture?.(pointerId);
      });
      visual.addEventListener("pointerup", (event) => {
        if (pointerStartX === null) return;
        const distance = event.clientX - pointerStartX;
        pointerStartX = null;
        if (pointerId !== null && visual.hasPointerCapture?.(pointerId)) visual.releasePointerCapture(pointerId);
        pointerId = null;
        if (Math.abs(distance) < 32) return;
        event.preventDefault();
        suppressNextClick = true;
        renderImage(currentIndex + (distance < 0 ? 1 : -1));
      });
      visual.addEventListener("pointercancel", () => {
        pointerStartX = null;
        pointerId = null;
      });
    }

    card.addEventListener("click", (event) => {
      if (!suppressNextClick) return;
      event.preventDefault();
      suppressNextClick = false;
    }, true);

    if (product.colorOptions && product.variants.length > 1) {
      const options = document.createElement("div");
      options.className = "product-card-colors";
      options.setAttribute("aria-label", "Cores disponíveis");
      product.variants.forEach((variant) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.dataset.cardVariant = variant;
        swatch.title = variant;
        swatch.setAttribute("aria-label", `Ver cor ${variant}`);
        swatch.style.setProperty("--swatch-color", colorNames[variant] || "#c9c9c9");
        swatch.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const targetIndex = entries.findIndex((entry) => entry.variant === variant);
          if (targetIndex >= 0) renderImage(targetIndex);
        });
        options.appendChild(swatch);
      });
      copy.appendChild(options);
    }

    renderImage(0);
  });
  const title = qs("[data-products-title]");
  const count = qs("[data-products-count]");
  const labels = {
    Todos: "Todos os produtos",
    Roupas: "Roupas",
    Chaveiros: "Chaveiros",
    Acessórios: "Acessórios",
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

  const renderAvailability = (inventory) => {
    cards.forEach((card) => {
      const product = PRODUCT_CATALOG[card.dataset.productId];
      const status = qs(".product-card-availability", card);
      if (!product || !status) return;
      if (!inventory) {
        status.className = "product-card-availability unknown";
        status.textContent = "Disponibilidade sob consulta";
        return;
      }
      const ready = product.sizes.some((size) => product.variants.some((variant) =>
        Number(inventory.get(inventoryKey(card.dataset.productId, size, variant)) || 0) > 0
      ));
      status.className = `product-card-availability ${ready ? "ready" : "production"}`;
      status.textContent = ready ? "Pronta entrega" : "Sob encomenda";
    });
  };
  loadPublicInventory().then(renderAvailability).catch(() => renderAvailability(null));
  watchPublicInventory(renderAvailability);
}

function setupProductPage() {
  const form = qs("[data-product-form]");
  if (!form) return;
  const requestedId = new URLSearchParams(location.search).get("id") || "camiseta-oversized";
  const id = PRODUCT_CATALOG[requestedId] ? requestedId : "camiseta-oversized";
  const product = PRODUCT_CATALOG[id];
  qs("[data-product-name]").textContent = product.name;
  qs("[data-product-category]").textContent = product.category;
  qs("[data-product-description]").textContent = product.description;
  document.title = `${product.name} — Only Cars Club`;
  const productImageElement = qs("[data-product-image]");
  const gallery = qs("[data-product-gallery]");
  const galleryProgress = qs("[data-product-gallery-progress]");
  const previousImage = qs("[data-product-previous]");
  const nextImage = qs("[data-product-next]");
  const galleryCount = qs("[data-product-gallery-count]");
  let currentGallery = getProductGallery(product, product.variants[0]);
  let productImages = currentGallery.images;
  let productImageAlts = currentGallery.alts;
  let hasMultipleImages = productImages.length > 1;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let activeImage = 0;
  let galleryTransitioning = false;

  const commitImage = (index) => {
    activeImage = index;
    productImageElement.src = productImages[activeImage];
    productImageElement.alt = productImageAlts?.[activeImage] || product.name;
    if (galleryCount) galleryCount.textContent = `${activeImage + 1} / ${productImages.length}`;
    if (galleryProgress) {
      galleryProgress.style.setProperty("--gallery-progress", `${((activeImage + 1) / productImages.length) * 100}%`);
      galleryProgress.setAttribute("aria-valuenow", String(activeImage + 1));
      galleryProgress.setAttribute("aria-valuemax", String(productImages.length));
      galleryProgress.setAttribute("aria-valuetext", `Foto ${activeImage + 1} de ${productImages.length}`);
    }
  };

  const showImage = (index, immediate = false) => {
    const nextIndex = (index + productImages.length) % productImages.length;
    if (nextIndex === activeImage && !immediate) return;

    if (immediate || !hasMultipleImages || reducedMotion.matches || !gallery) {
      commitImage(nextIndex);
      return;
    }

    if (galleryTransitioning) return;
    galleryTransitioning = true;

    gallery.classList.remove("gallery-transition-blur");
    void gallery.offsetWidth;
    gallery.classList.add("gallery-transition-blur");
    gallery.setAttribute("aria-busy", "true");

    window.setTimeout(() => {
      commitImage(nextIndex);
    }, 310);

    window.setTimeout(() => {
      gallery.classList.remove("gallery-transition-blur");
      gallery.removeAttribute("aria-busy");
      galleryTransitioning = false;
    }, 620);
  };

  const updateGalleryControls = () => {
    hasMultipleImages = productImages.length > 1;
    if (previousImage) previousImage.hidden = !hasMultipleImages;
    if (nextImage) nextImage.hidden = !hasMultipleImages;
    if (galleryCount) galleryCount.hidden = !hasMultipleImages;
    if (galleryProgress) galleryProgress.hidden = !hasMultipleImages;
  };
  const setVariantGallery = (variant) => {
    currentGallery = getProductGallery(product, variant);
    productImages = currentGallery.images;
    productImageAlts = currentGallery.alts;
    activeImage = 0;
    updateGalleryControls();
    showImage(0, true);
  };
  updateGalleryControls();
  previousImage?.addEventListener("click", () => showImage(activeImage - 1));
  nextImage?.addEventListener("click", () => showImage(activeImage + 1));
  let swipeStartX = null;
  gallery?.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    swipeStartX = event.clientX;
    gallery.setPointerCapture?.(event.pointerId);
  });
  gallery?.addEventListener("pointerup", (event) => {
    if (swipeStartX === null) return;
    const distance = event.clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(distance) < 45) return;
    showImage(activeImage + (distance < 0 ? 1 : -1));
  });
  gallery?.addEventListener("pointercancel", () => swipeStartX = null);
  showImage(0, true);
  const renderOptions = (target, name, values, swatches = false) => {
    if (!target) return;
    target.classList.toggle("color-options", swatches);
    target.replaceChildren();
    values.forEach((value, index) => {
      const colorClass = value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const label = document.createElement("label");
      const input = document.createElement("input");
      const content = document.createElement("span");
      input.type = "radio";
      input.name = name;
      input.value = value;
      input.checked = index === 0;
      input.setAttribute("aria-label", value);
      if (swatches) {
        content.className = `color-swatch color-${colorClass}`;
        content.title = value;
        const accessibleLabel = document.createElement("span");
        accessibleLabel.className = "sr-only";
        accessibleLabel.textContent = value;
        content.appendChild(accessibleLabel);
      } else {
        content.textContent = value;
      }
      label.append(input, content);
      target.appendChild(label);
    });
  };
  renderOptions(qs("[data-size-options]"), "size", product.sizes);
  renderOptions(qs("[data-variant-options]"), "variant", product.variants, product.colorOptions);
  if (product.colorOptions) qs("[data-variant-legend]").textContent = "Cor";
  const giftField = qs("[data-gift-field]");
  if (id === "moletom" && giftField) {
    giftField.hidden = false;
    renderOptions(qs("[data-gift-options]", giftField), "gift", MOLETOM_GIFT_OPTIONS);
    const firstGift = qs('input[name="gift"]', giftField);
    if (firstGift) firstGift.checked = false;
  }
  const priceElement = qs("[data-product-price]");
  const originalPriceElement = qs("[data-product-original-price]");
  const availability = qs("[data-product-availability]");
  const availabilityTitle = qs("[data-product-availability-title]");
  const availabilityText = qs("[data-product-availability-text]");
  const addCartButton = qs(".add-cart-button", form);
  const formatPrice = (value) => value.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
  let selectedPrice = getCatalogPrice(product, product.sizes[0], product.variants[0]);
  let inventory = null;
  let inventoryFailed = false;
  const updateAvailability = (size, variant) => {
    if (!inventory) {
      availability?.classList.remove("ready", "production");
      if (availabilityTitle) availabilityTitle.textContent = inventoryFailed ? "Disponibilidade sob consulta" : "Consultando disponibilidade";
      if (availabilityText) availabilityText.textContent = inventoryFailed
        ? "Você pode comprar normalmente. Nossa equipe confirmará o prazo desta opção."
        : "Estamos verificando o estoque desta opção.";
      return;
    }
    const ready = Number(inventory.get(inventoryKey(id, size, variant)) || 0) > 0;
    availability?.classList.toggle("ready", ready);
    availability?.classList.toggle("production", !ready);
    if (availabilityTitle) availabilityTitle.textContent = ready ? "Pronta entrega" : "Produto sob encomenda";
    if (availabilityText) {
      availabilityText.textContent = ready
        ? "Esta opção está disponível à pronta entrega. Após o pedido, combinaremos a entrega ou retirada."
        : "Você pode comprar normalmente. Esta opção será produzida sob encomenda, com prazo de até 10 dias úteis para combinarmos a entrega ou retirada.";
    }
  };
  const updateSelectedPrice = () => {
    const selectedSize = qs('input[name="size"]:checked', form)?.value || product.sizes[0];
    const selectedVariant = qs('input[name="variant"]:checked', form)?.value || product.variants[0];
    const originalPrice = getOriginalCatalogPrice(product, selectedSize, selectedVariant);
    selectedPrice = getCatalogPrice(product, selectedSize, selectedVariant);
    priceElement.textContent = product.unavailable ? product.price : formatPrice(selectedPrice);
    priceElement.hidden = false;
    priceElement.setAttribute("aria-label", `Preço promocional: ${priceElement.textContent}`);
    if (originalPriceElement) {
      originalPriceElement.textContent = formatPrice(originalPrice);
      originalPriceElement.hidden = false;
      originalPriceElement.setAttribute("aria-label", `Preço original: ${originalPriceElement.textContent}`);
    }
    updateAvailability(selectedSize, selectedVariant);
  };
  qsa('input[name="variant"]', form).forEach((input) => input.addEventListener("change", () => {
    if (product.variantImages?.[input.value]) {
      setVariantGallery(input.value);
    } else {
      const imageIndex = product.variantImageIndices?.[input.value];
      if (Number.isInteger(imageIndex)) showImage(imageIndex);
    }
    updateSelectedPrice();
  }));
  qsa('input[name="size"]', form).forEach((input) => input.addEventListener("change", () => {
    updateSelectedPrice();
  }));
  updateSelectedPrice();
  const renderInventory = (nextInventory) => {
    inventory = nextInventory;
    inventoryFailed = !nextInventory;
    updateSelectedPrice();
  };
  loadPublicInventory().then(renderInventory).catch(() => renderInventory(null));
  watchPublicInventory(renderInventory);
  if (product.unavailable && addCartButton) {
    addCartButton.disabled = true;
    addCartButton.textContent = "Preço em definição";
  }
  const quantity = qs("[data-quantity]");
  qs("[data-quantity-minus]").addEventListener("click", () => quantity.value = Math.max(1, Number(quantity.value) - 1));
  qs("[data-quantity-plus]").addEventListener("click", () => quantity.value = Math.min(99, Number(quantity.value) + 1));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (product.unavailable) {
      const feedback = qs("[data-cart-feedback]");
      feedback.textContent = "Este produto estará disponível assim que o preço for definido.";
      feedback.classList.add("visible");
      return;
    }
    const data = new FormData(form);
    const variant = data.get("variant");
    const gift = data.get("gift");
    if (id === "moletom" && !MOLETOM_GIFT_OPTIONS.includes(gift)) {
      const feedback = qs("[data-cart-feedback]");
      feedback.textContent = "Escolha 1 adesivo de brinde para adicionar o moletom ao carrinho.";
      feedback.classList.add("visible");
      qs('input[name="gift"]', form)?.focus();
      return;
    }
    const cartGallery = getProductGallery(product, variant);
    const cartImageIndex = product.variantImageIndices?.[variant] ?? 0;
    const item = normalizeCartItem({
      id,
      size:data.get("size"),
      variant,
      gift,
      quantity:Number(quantity.value) || 1,
      price:selectedPrice,
      image:cartGallery.images[cartImageIndex] || cartGallery.images[0]
    });
    if (!item) return;
    const cart = getCart();
    const existing = cart.find((entry) => entry.id === item.id && entry.size === item.size && entry.variant === item.variant && entry.gift === item.gift && entry.price === item.price);
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
    if (!Array.isArray(cart)) return [];
    return cart.map(normalizeCartItem).filter(Boolean);
  } catch {
    return [];
  }
}

function saveCart(cart) {
  const normalizedCart = Array.isArray(cart) ? cart.map(normalizeCartItem).filter(Boolean) : [];
  localStorage.setItem("onlyCarsCart", JSON.stringify(normalizedCart));
  if (!normalizedCart.length) {
    sessionStorage.removeItem("onlyCarsDelivery");
    sessionStorage.removeItem("onlyCarsShippingQuote");
    sessionStorage.removeItem("onlyCarsCheckoutCustomer");
    sessionStorage.removeItem("onlyCarsCheckoutMaxStep");
  }
  updateCartCount(normalizedCart);
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
      items.replaceChildren();
      return;
    }
    const fragment = document.createDocumentFragment();
    cart.forEach((item, index) => {
      const article = document.createElement("article");
      const imageBox = document.createElement("div");
      const image = document.createElement("img");
      const info = document.createElement("div");
      const details = document.createElement("p");
      const title = document.createElement("h2");
      const priceLine = document.createElement("div");
      const unitPrice = document.createElement("strong");
      const originalUnitPrice = document.createElement("del");
      const discountTag = document.createElement("span");
      const remove = document.createElement("button");
      const actions = document.createElement("div");
      const quantityControl = document.createElement("span");
      const minus = document.createElement("button");
      const quantityInput = document.createElement("input");
      const plus = document.createElement("button");
      const subtotal = document.createElement("strong");

      article.className = "cart-item";
      article.dataset.cartIndex = String(index);
      imageBox.className = "cart-item-image";
      image.src = item.image;
      image.alt = item.name;
      imageBox.appendChild(image);

      info.className = "cart-item-info";
      details.textContent = `${item.variant || "Padrão"}${item.size ? ` · ${item.size}` : ""}${item.gift ? ` · Brinde: ${item.gift}` : ""}`;
      title.textContent = item.name;
      const originalItemPrice = getOriginalCatalogPrice(PRODUCT_CATALOG[item.id], item.size, item.variant);
      priceLine.className = "cart-item-price";
      unitPrice.textContent = formatCurrency(item.price);
      originalUnitPrice.textContent = formatCurrency(originalItemPrice);
      discountTag.textContent = "10% OFF";
      priceLine.append(unitPrice, originalUnitPrice, discountTag);
      remove.type = "button";
      remove.className = "cart-remove";
      remove.dataset.cartRemove = "";
      remove.setAttribute("aria-label", `Excluir ${item.name}`);
      remove.title = "Excluir item";
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
      info.append(details, title, priceLine, remove);

      actions.className = "cart-item-actions";
      quantityControl.className = "quantity-control";
      minus.type = "button";
      minus.dataset.cartMinus = "";
      minus.setAttribute("aria-label", "Diminuir quantidade");
      minus.textContent = "−";
      quantityInput.type = "number";
      quantityInput.min = "1";
      quantityInput.max = "99";
      quantityInput.value = String(item.quantity);
      quantityInput.dataset.cartQuantity = "";
      quantityInput.setAttribute("aria-label", `Quantidade de ${item.name}`);
      plus.type = "button";
      plus.dataset.cartPlus = "";
      plus.setAttribute("aria-label", "Aumentar quantidade");
      plus.textContent = "+";
      subtotal.className = "cart-item-subtotal";
      subtotal.textContent = formatCurrency(item.price * item.quantity);
      quantityControl.append(minus, quantityInput, plus);
      actions.append(quantityControl, subtotal);

      article.append(imageBox, info, actions);
      fragment.appendChild(article);
    });
    items.replaceChildren(fragment);
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

function buildShippingPackage(cart) {
  const items = cart.filter((item) => Number(item.quantity) > 0);
  if (!items.length || items.some((item) => !item.shippingEligible)) return null;
  const quantity = items.reduce((total, item) => total + Number(item.quantity), 0);
  const weightGrams = items.reduce(
    (total, item) => total + Number(item.weightGrams) * Number(item.quantity),
    0
  );
  const dimensions = quantity === 1
    ? { length:30, width:20, height:8 }
    : { length:70, width:50, height:8 };
  return Object.freeze({ ...dimensions, weightGrams, weightKg:weightGrams / 1000 });
}

async function setupCheckoutCustomer(deliveryForm) {
  const section = qs("[data-checkout-customer]", deliveryForm);
  if (!section) return null;
  const status = qs("[data-checkout-customer-status]", section);
  const email = qs("[data-checkout-customer-email]", section);
  const client = window.OnlySupabase;
  const setStatus = (message, state = "") => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };
  if (!client?.getUser || !client?.rest) {
    setStatus("Não foi possível carregar o acesso à sua conta.", "error");
    return null;
  }
  const user = await client.getUser().catch(() => null);
  if (!user) {
    location.replace("login.html?next=entrega.html");
    return null;
  }
  if (email) email.textContent = user.email || "";
  let addressId = null;
  try {
    const [profiles, addresses] = await Promise.all([
      client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,display_name,phone,tax_id`),
      client.rest("addresses?select=id,recipient_name,postal_code,street,number,complement,neighborhood,city,state,is_default&order=is_default.desc,created_at.asc&limit=1")
    ]);
    const profile = profiles?.[0] || {};
    const address = addresses?.[0] || {};
    addressId = address.id || null;
    const values = {
      recipient_name:address.recipient_name || profile.display_name || "",
      phone:profile.phone || "",
      tax_id:profile.tax_id || "",
      postal_code:address.postal_code || "",
      street:address.street || "",
      number:address.number || "",
      complement:address.complement || "",
      neighborhood:address.neighborhood || "",
      city:address.city || "",
      state:address.state || ""
    };
    Object.entries(values).forEach(([name, value]) => {
      const input = deliveryForm.elements[name];
      if (input) input.value = String(value);
    });
    const postalCode = deliveryForm.elements.postal_code;
    if (postalCode?.value) {
      const digits = postalCode.value.replace(/\D/g, "").slice(0, 8);
      postalCode.value = digits.replace(/(\d{5})(\d)/, "$1-$2");
    }
    setStatus(addressId ? "Endereço principal carregado. Você pode atualizar os dados abaixo." : "Complete os dados para salvar seu endereço principal.", "success");
  } catch (error) {
    setStatus(error?.message || "Não foi possível carregar seus dados. Preencha-os para continuar.", "error");
  }

  const phoneInput = deliveryForm.elements.phone;
  const taxIdInput = deliveryForm.elements.tax_id;
  phoneInput?.addEventListener("input", () => {
    const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    phoneInput.value = digits.length > 10
      ? digits.replace(/(\d{2})(\d{5})(\d{1,4})/, "($1) $2-$3")
      : digits.replace(/(\d{2})(\d{4})(\d{1,4})/, "($1) $2-$3");
  });
  taxIdInput?.addEventListener("input", () => {
    const digits = taxIdInput.value.replace(/\D/g, "").slice(0, 11);
    taxIdInput.value = digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  });

  const postalCodeInput = deliveryForm.elements.postal_code;
  const numberInput = deliveryForm.elements.number;
  const noNumberInput = deliveryForm.elements.no_number;
  const applyNoNumber = () => {
    if (!numberInput || !noNumberInput) return;
    if (noNumberInput.checked) {
      numberInput.value = "S/N";
      numberInput.readOnly = true;
      numberInput.required = false;
    } else {
      if (numberInput.value === "S/N") numberInput.value = "";
      numberInput.readOnly = false;
      numberInput.required = true;
    }
  };
  if (noNumberInput && numberInput?.value.trim().toUpperCase() === "S/N") noNumberInput.checked = true;
  applyNoNumber();
  noNumberInput?.addEventListener("change", applyNoNumber);

  let postalCodeTimer = null;
  let lastPostalCodeLookup = "";
  const lookupPostalCode = async () => {
    const postalCode = postalCodeInput?.value.replace(/\D/g, "") || "";
    if (postalCode.length !== 8 || postalCode === lastPostalCodeLookup) return;
    lastPostalCodeLookup = postalCode;
    setStatus("Buscando o endereço deste CEP...", "loading");
    try {
      const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, {
        headers:{ Accept:"application/json" }
      });
      if (!response.ok) throw new Error("Não foi possível consultar este CEP.");
      const address = await response.json();
      if (address?.erro) throw new Error("CEP não encontrado.");
      const fields = {
        street:address.logradouro || "",
        neighborhood:address.bairro || "",
        city:address.localidade || "",
        state:address.uf || ""
      };
      Object.entries(fields).forEach(([name, value]) => {
        const input = deliveryForm.elements[name];
        if (input && value) input.value = value;
      });
      setStatus("Endereço localizado. Confira os dados e informe o número.", "success");
      if (!noNumberInput?.checked) numberInput?.focus();
    } catch (error) {
      lastPostalCodeLookup = "";
      setStatus(error?.message || "Não foi possível buscar o endereço. Preencha os campos manualmente.", "error");
    }
  };
  postalCodeInput?.addEventListener("input", () => {
    window.clearTimeout(postalCodeTimer);
    const postalCode = postalCodeInput.value.replace(/\D/g, "");
    if (postalCode.length === 8) postalCodeTimer = window.setTimeout(lookupPostalCode, 350);
  });
  postalCodeInput?.addEventListener("blur", lookupPostalCode);

  return {
    user,
    async save() {
      const formData = new FormData(deliveryForm);
      const phone = String(formData.get("phone") || "").replace(/\D/g, "");
      const taxId = String(formData.get("tax_id") || "").replace(/\D/g, "");
      const postalCode = String(formData.get("postal_code") || "").replace(/\D/g, "");
      const state = String(formData.get("state") || "").trim().toUpperCase();
      if (![10, 11].includes(phone.length)) throw new Error("Digite um telefone com DDD válido.");
      if (taxId && taxId.length !== 11) throw new Error("Digite os 11 números do CPF.");
      if (postalCode.length !== 8) throw new Error("Digite um CEP com 8 números.");
      if (!/^[A-Z]{2}$/.test(state)) throw new Error("Digite a sigla do estado com 2 letras.");
      const recipientName = String(formData.get("recipient_name") || "").trim();
      const address = {
        user_id:user.id,
        label:"Principal",
        recipient_name:recipientName,
        postal_code:postalCode,
        street:String(formData.get("street") || "").trim(),
        number:String(formData.get("number") || "").trim(),
        complement:String(formData.get("complement") || "").trim() || null,
        neighborhood:String(formData.get("neighborhood") || "").trim(),
        city:String(formData.get("city") || "").trim(),
        state,
        is_default:true
      };
      setStatus("Salvando seus dados...", "loading");
      await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method:"PATCH",
        headers:{ Prefer:"return=minimal" },
        body:{ display_name:recipientName, phone, tax_id:taxId || null }
      });
      if (addressId) {
        await client.rest(`addresses?id=eq.${encodeURIComponent(addressId)}`, {
          method:"PATCH",
          headers:{ Prefer:"return=minimal" },
          body:address
        });
      } else {
        const created = await client.rest("addresses", {
          method:"POST",
          headers:{ Prefer:"return=representation" },
          body:address
        });
        addressId = created?.[0]?.id || null;
      }
      const checkoutCustomer = {
        email:user.email || "",
        phone,
        taxId,
        ...address
      };
      sessionStorage.setItem("onlyCarsCheckoutCustomer", JSON.stringify(checkoutCustomer));
      setStatus("Dados de entrega salvos.", "success");
      return checkoutCustomer;
    }
  };
}

function setupCheckoutFlow() {
  const cart = getCart().filter((item) => Number(item.quantity) > 0);
  const hasCompanionProduct = cart.some((item) => !item.pickupOnly);
  const shippingPackage = buildShippingPackage(cart);
  const registeredWeightGrams = cart.reduce(
    (total, item) => total + (Number(item.weightGrams) || 0) * Number(item.quantity),
    0
  );
  const productTotal = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const pickupDeliveries = [
    "Retirar no próximo evento do Only",
    "Pedir um motoboy para retirar",
    "Vou retirar pessoalmente"
  ];
  const allowedPayments = ["Pix", "Cartão — sujeito a taxas"];
  const deliveryForm = qs("[data-delivery-form]");
  const paymentForm = qs("[data-payment-form]");
  const readShippingQuote = () => {
    try {
      const quote = JSON.parse(sessionStorage.getItem("onlyCarsShippingQuote"));
      return quote && Number.isFinite(Number(quote.price)) ? quote : null;
    } catch (_) {
      sessionStorage.removeItem("onlyCarsShippingQuote");
      return null;
    }
  };
  const isDeliveryAllowed = (delivery) =>
    pickupDeliveries.includes(delivery)
    || (typeof delivery === "string" && delivery.startsWith("Envio — "));
  if (!deliveryForm && !paymentForm) return;
  if (!cart.length) {
    location.replace("carrinho.html");
    return;
  }

  if (deliveryForm) {
    const customerPromise = setupCheckoutCustomer(deliveryForm);
    const error = qs("[data-checkout-error]", deliveryForm);
    const calculator = qs("[data-shipping-calculator]", deliveryForm);
    const postalCodeInput = qs("[data-shipping-postal-code]", deliveryForm);
    const calculateButton = qs("[data-shipping-calculate]", deliveryForm);
    const shippingStatus = qs("[data-shipping-status]", deliveryForm);
    const shippingResults = qs("[data-shipping-results]", deliveryForm);
    const saveCustomerButton = qs("[data-checkout-save-customer]", deliveryForm);
    const motoboyInput = qs('input[name="delivery"][value="Pedir um motoboy para retirar"]', deliveryForm);
    const motoboyOption = motoboyInput?.closest(".checkout-option");
    const savedDelivery = sessionStorage.getItem("onlyCarsDelivery") || "";
    const savedQuote = readShippingQuote();

    if (!hasCompanionProduct && motoboyInput) {
      motoboyInput.checked = false;
      motoboyInput.disabled = true;
      if (motoboyOption) motoboyOption.hidden = true;
      if (error) error.textContent = "Chaveiros e adesivos comprados sem outro produto ficam disponíveis somente para retirada no evento ou retirada pessoal.";
    }

    if (!shippingPackage && calculator) {
      calculator.classList.add("is-unavailable");
      if (postalCodeInput) postalCodeInput.disabled = true;
      if (calculateButton) calculateButton.disabled = true;
      if (shippingStatus) {
        shippingStatus.textContent = "A cotação automática está disponível, por enquanto, somente para moletom e camisetas oversized ou streetwear.";
      }
    }

    const savedPickup = pickupDeliveries.includes(savedDelivery)
      && (hasCompanionProduct || savedDelivery !== "Pedir um motoboy para retirar")
      ? qs(`input[name="delivery"][value="${CSS.escape(savedDelivery)}"]`, deliveryForm)
      : null;
    if (savedPickup) savedPickup.checked = true;
    if (postalCodeInput && savedQuote?.postalCode) postalCodeInput.value = savedQuote.postalCode.replace(/^(\d{5})(\d{3})$/, "$1-$2");

    const setShippingStatus = (message, state = "") => {
      if (!shippingStatus) return;
      shippingStatus.textContent = message;
      shippingStatus.dataset.state = state;
    };

    const renderQuotes = (quotes, postalCode) => {
      if (!shippingResults) return;
      shippingResults.replaceChildren();
      const available = quotes
        .filter((quote) => !quote?.error && Number.isFinite(Number(quote?.custom_price ?? quote?.price)))
        .sort((a, b) => Number(a.custom_price ?? a.price) - Number(b.custom_price ?? b.price));
      if (!available.length) {
        const firstError = quotes.find((quote) => quote?.error)?.error;
        setShippingStatus(firstError || "Nenhuma transportadora atende este CEP para o pacote informado.", "error");
        return;
      }
      const fragment = document.createDocumentFragment();
      available.forEach((quote) => {
        const serviceName = String(quote.name || quote.company?.name || "Transportadora");
        const companyName = String(quote.company?.name || "");
        const price = Number(quote.custom_price ?? quote.price);
        const deliveryTime = Number(quote.custom_delivery_time ?? quote.delivery_time);
        const label = document.createElement("label");
        const input = document.createElement("input");
        const icon = document.createElement("span");
        const copy = document.createElement("span");
        const title = document.createElement("strong");
        const details = document.createElement("small");
        const marker = document.createElement("i");
        label.className = "checkout-option shipping-option";
        input.type = "radio";
        input.name = "delivery";
        input.value = `Envio — ${serviceName}`;
        input.dataset.shippingQuote = JSON.stringify({
          serviceId:quote.id ?? null,
          serviceName,
          companyName,
          price,
          deliveryTime:Number.isFinite(deliveryTime) ? deliveryTime : null,
          postalCode
        });
        icon.className = "checkout-option-icon shipping-option-icon";
        icon.textContent = "↗";
        title.textContent = companyName && companyName !== serviceName
          ? `${companyName} · ${serviceName}`
          : serviceName;
        const deadline = Number.isFinite(deliveryTime)
          ? ` · até ${deliveryTime} ${deliveryTime === 1 ? "dia útil" : "dias úteis"}`
          : "";
        details.textContent = `${formatCurrency(price)}${deadline}`;
        copy.append(title, details);
        label.append(input, icon, copy, marker);
        if (savedDelivery === input.value && savedQuote?.postalCode === postalCode) input.checked = true;
        fragment.appendChild(label);
      });
      shippingResults.appendChild(fragment);
      setShippingStatus(`${available.length} ${available.length === 1 ? "opção encontrada" : "opções encontradas"}. Escolha uma para continuar.`, "success");
    };

    const calculateShipping = async () => {
      if (!shippingPackage || !postalCodeInput || !calculateButton) return;
      const customer = await customerPromise;
      if (!customer) return;
      const postalCode = postalCodeInput.value.replace(/\D/g, "");
      if (postalCode.length !== 8) {
        setShippingStatus("Digite um CEP válido com 8 números.", "error");
        postalCodeInput.focus();
        return;
      }
      calculateButton.disabled = true;
      calculateButton.textContent = "Calculando...";
      if (shippingResults) shippingResults.replaceChildren();
      setShippingStatus("Consultando transportadoras e prazos...", "loading");
      try {
        if (!window.OnlySupabase?.invokeFunction) throw new Error("Serviço de frete indisponível.");
        const response = await window.OnlySupabase.invokeFunction("melhor-envio-cotacao", {
          to_postal_code:postalCode,
          package:{
            height:shippingPackage.height,
            width:shippingPackage.width,
            length:shippingPackage.length,
            weight:shippingPackage.weightKg,
            insurance_value:Number(productTotal.toFixed(2))
          }
        });
        const quotes = Array.isArray(response?.quotes) ? response.quotes : [];
        renderQuotes(quotes, postalCode);
      } catch (requestError) {
        setShippingStatus(requestError?.message || "Não foi possível calcular o frete. Tente novamente.", "error");
      } finally {
        calculateButton.disabled = false;
        calculateButton.textContent = "Calcular frete";
      }
    };

    postalCodeInput?.addEventListener("input", () => {
      const digits = postalCodeInput.value.replace(/\D/g, "").slice(0, 8);
      postalCodeInput.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    });
    saveCustomerButton?.addEventListener("click", async () => {
      const customer = await customerPromise;
      if (!customer) return;
      const customerSection = qs("[data-checkout-customer]", deliveryForm);
      const invalidField = customerSection
        ? [...customerSection.querySelectorAll("input[required]")].find((input) => !input.checkValidity())
        : null;
      if (invalidField) {
        invalidField.reportValidity();
        invalidField.focus();
        return;
      }
      saveCustomerButton.disabled = true;
      const originalLabel = saveCustomerButton.textContent;
      saveCustomerButton.textContent = "Salvando...";
      if (error) error.textContent = "";
      try {
        await customer.save();
        saveCustomerButton.textContent = "Dados salvos ✓";
        window.setTimeout(() => {
          saveCustomerButton.textContent = originalLabel;
          saveCustomerButton.disabled = false;
        }, 1800);
      } catch (saveError) {
        if (error) error.textContent = saveError?.message || "Não foi possível salvar os dados.";
        saveCustomerButton.textContent = originalLabel;
        saveCustomerButton.disabled = false;
      }
    });
    calculateButton?.addEventListener("click", calculateShipping);
    postalCodeInput?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      calculateShipping();
    });

    deliveryForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const customer = await customerPromise;
      if (!customer) return;
      if (!deliveryForm.reportValidity()) return;
      const selectedInput = qs('input[name="delivery"]:checked', deliveryForm);
      const selected = selectedInput?.value || "";
      if (!isDeliveryAllowed(selected)
        || (!hasCompanionProduct && selected === "Pedir um motoboy para retirar")) {
        if (error) error.textContent = "Escolha uma forma de entrega disponível para este pedido.";
        return;
      }
      const customerTaxId = String(deliveryForm.elements.tax_id?.value || "").replace(/\D/g, "");
      if (selected.startsWith("Envio — ") && customerTaxId.length !== 11) {
        if (error) error.textContent = "Informe o CPF para gerar a etiqueta de envio.";
        deliveryForm.elements.tax_id?.focus();
        return;
      }
      try {
        await customer.save();
      } catch (customerError) {
        if (error) error.textContent = customerError?.message || "Revise os dados de entrega.";
        return;
      }
      if (selected.startsWith("Envio — ")) {
        if (!selectedInput.dataset.shippingQuote) {
          if (error) error.textContent = "Calcule o frete novamente e escolha uma transportadora.";
          return;
        }
        sessionStorage.setItem("onlyCarsShippingQuote", selectedInput.dataset.shippingQuote);
      } else {
        sessionStorage.removeItem("onlyCarsShippingQuote");
      }
      sessionStorage.setItem("onlyCarsDelivery", selected);
      navigateWithTransition("pagamento.html");
    });
  }

  if (paymentForm) {
    const paymentButton = qs("button[type='submit']", paymentForm);
    if (paymentButton) paymentButton.disabled = true;
    const paymentAccessPromise = window.OnlySupabase?.getUser?.()
      .catch(() => null)
      .then((user) => {
        if (!user) {
          location.replace("login.html?next=entrega.html");
          return null;
        }
        if (paymentButton) paymentButton.disabled = false;
        return user;
      }) || Promise.resolve(null);
    const delivery = sessionStorage.getItem("onlyCarsDelivery") || "";
    const shippingQuote = readShippingQuote();
    if (!isDeliveryAllowed(delivery) || (delivery.startsWith("Envio — ") && !shippingQuote)) {
      location.replace("entrega.html");
      return;
    }
    const shippingPrice = delivery.startsWith("Envio — ") ? Number(shippingQuote.price) : 0;
    const total = productTotal + shippingPrice;
    const totalLabel = qs(".checkout-order-total span", paymentForm);
    if (totalLabel) totalLabel.textContent = shippingPrice > 0 ? "Total com frete" : "Total dos produtos";
    qs("[data-checkout-total]", paymentForm).textContent = formatCurrency(total);
    paymentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const authenticatedUser = await paymentAccessPromise;
      if (!authenticatedUser) return;
      const payment = new FormData(paymentForm).get("payment");
      if (!allowedPayments.includes(payment)) {
        qs("[data-checkout-error]", paymentForm).textContent = "Escolha uma forma de pagamento para continuar.";
        return;
      }
      const lines = cart.map((item, index) => {
        const details = [
          `*${index + 1}. ${item.name}*${item.variant ? ` - ${item.variant}` : ""}${item.size ? ` - Tamanho: ${item.size}` : ""}`,
          item.gift ? `Adesivo de brinde: *${item.gift}* (grátis)` : "",
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
        shippingQuote ? `CEP: _${shippingQuote.postalCode}_` : null,
        shippingQuote ? `Frete: _${formatCurrency(shippingPrice)}${shippingQuote.deliveryTime ? ` · até ${shippingQuote.deliveryTime} dias úteis` : ""}_` : null,
        `Pagamento: _${payment}_`,
        registeredWeightGrams > 0 ? `Peso cadastrado dos produtos: _${registeredWeightGrams} g_` : null,
        shippingPackage ? `Pacote: _${shippingPackage.length} × ${shippingPackage.width} × ${shippingPackage.height} cm_` : null,
        "",
        `Produtos: ${formatCurrency(productTotal)}`,
        shippingPrice > 0 ? `Frete: ${formatCurrency(shippingPrice)}` : null,
        `*TOTAL: ${formatCurrency(total)}*`,
        "_Produto, cor, tamanho, quantidade e valores serão conferidos pela equipe antes da confirmação._",
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
    ".card:not(.value-card)",
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
      const profileLabel = card.dataset.profileLabel || "Administrador. Toque para ver o carro";
      const carLabel = card.dataset.carLabel || "Carro do administrador. Toque para voltar ao perfil";
      card.setAttribute("aria-pressed", String(open));
      card.setAttribute("aria-label", open ? carLabel : profileLabel);
    };

    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  });
}

function setupValuesStack() {
  const stack = qs(".values-stack");
  if (!stack) return;

  const cards = qsa(".value-card", stack);
  const total = cards.length;
  if (!total) return;

  let currentIndex = 0;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocityX = 0;
  let deltaX = 0;
  let deltaY = 0;
  let dragged = false;
  let cycling = false;

  const getDepth = (index) => (index - currentIndex + total) % total;

  const setStack = (dragProgress = 0) => {
    cards.forEach((card, index) => {
      const depth = getDepth(index);
      const visibleDepth = Math.min(depth, 3);
      const easedProgress = Math.min(1, Math.max(0, dragProgress));
      const baseScale = 1 - visibleDepth * .045;
      const promotedScale = visibleDepth > 0
        ? baseScale + .045 * easedProgress
        : 1;
      const baseRotation = visibleDepth === 0
        ? 0
        : [0, -2.4, 2.1, -1.2][visibleDepth];
      const promotedRotation = baseRotation * (1 - easedProgress);

      card.style.setProperty("--stack-scale", `${promotedScale}`);
      card.style.setProperty("--stack-rotation", `${promotedRotation}deg`);
      card.style.setProperty("--stack-opacity", depth > 3 ? "0" : `${1 - visibleDepth * .12}`);
      card.style.zIndex = `${total - depth}`;
      card.classList.toggle("is-front", depth === 0);
      card.tabIndex = depth === 0 ? 0 : -1;
      card.setAttribute("aria-hidden", depth === 0 ? "false" : "true");

      if (depth === 0) {
        const title = qs("h3", card)?.textContent?.trim() || "Valor";
        card.setAttribute("aria-label", `${title}. Arraste ou toque para ver o próximo valor`);
      }
    });
  };

  const cycle = (direction = 1) => {
    if (cycling) return;
    const front = cards[currentIndex];
    if (!front) return;

    cycling = true;
    const sign = direction < 0 ? -1 : 1;
    const throwDistance = Math.max(window.innerWidth, stack.clientWidth * 2);
    front.style.setProperty("--throw-x", `${sign * throwDistance}px`);
    front.style.setProperty("--throw-y", `${Math.max(-36, Math.min(36, deltaY * .18))}px`);
    front.style.setProperty("--throw-rotation", `${sign * 16}deg`);
    front.classList.remove("is-dragging");
    front.classList.add("is-leaving");
    setStack(1);

    window.setTimeout(() => {
      currentIndex = (currentIndex + 1) % total;
      front.classList.remove("is-leaving");
      front.style.removeProperty("--throw-x");
      front.style.removeProperty("--throw-y");
      front.style.removeProperty("--throw-rotation");
      front.style.removeProperty("transform");
      setStack(0);
      cycling = false;
    }, 460);
  };

  stack.addEventListener("pointerdown", (event) => {
    const front = cards[currentIndex];
    if (!front || !front.contains(event.target) || cycling) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    lastX = event.clientX;
    lastTime = performance.now();
    velocityX = 0;
    deltaX = 0;
    deltaY = 0;
    dragged = false;
    front.setPointerCapture?.(pointerId);
    front.classList.add("is-dragging");
  });

  stack.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || cycling) return;
    const front = cards[currentIndex];
    if (!front) return;

    const now = performance.now();
    const elapsed = Math.max(1, now - lastTime);
    velocityX = (event.clientX - lastX) / elapsed;
    lastX = event.clientX;
    lastTime = now;
    deltaX = event.clientX - startX;
    deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 7) dragged = true;
    if (!dragged) return;

    const rotation = Math.max(-16, Math.min(16, deltaX / 16));
    const progress = Math.min(1, Math.abs(deltaX) / (stack.clientWidth * .42));
    front.style.transform = `translate3d(${deltaX}px,${deltaY * .16}px,40px) rotate(${rotation}deg) scale(${1 - progress * .018})`;
    setStack(progress);
  }, { passive:true });

  const finish = (event, cancelled = false) => {
    if (event.pointerId !== pointerId) return;
    const front = cards[currentIndex];
    pointerId = null;
    if (!front) return;

    front.classList.remove("is-dragging");
    front.style.removeProperty("transform");
    const passedDistance = Math.abs(deltaX) > Math.max(64, stack.clientWidth * .2);
    const passedVelocity = Math.abs(velocityX) > .55;
    if (!cancelled && (passedDistance || passedVelocity)) {
      cycle(deltaX < 0 ? -1 : 1);
      return;
    }

    setStack(0);
    if (!cancelled && !dragged) cycle(1);
  };

  stack.addEventListener("pointerup", (event) => finish(event));
  stack.addEventListener("pointercancel", (event) => finish(event, true));
  stack.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    cycle(event.key === "ArrowLeft" ? -1 : 1);
  });

  setStack();
}

function setupPageHeroParallax() {
  const hero = qs('body[data-page="sobre"] .page-hero');
  if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;
  const render = () => {
    const box = hero.getBoundingClientRect();
    const visible = box.bottom > 0 && box.top < window.innerHeight;
    if (visible) {
      const strength = window.innerWidth <= 600 ? .065 : .1;
      const distance = Math.max(-58, Math.min(58, -box.top * strength));
      hero.style.setProperty("--page-hero-parallax", `${distance.toFixed(2)}px`);
    }
    ticking = false;
  };

  const requestRender = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(render);
  };

  render();
  window.addEventListener("scroll", requestRender, { passive:true });
  window.addEventListener("resize", requestRender, { passive:true });
}

function setupOnlyCarsAppMetadata() {
  const head = document.head;
  if (!head) return;

  const upsertLink = (rel, href, attributes = {}) => {
    let link = head.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      head.appendChild(link);
    }
    link.href = href;
    Object.entries(attributes).forEach(([name, value]) => link.setAttribute(name, value));
  };

  upsertLink("icon", "assets/icons/favicon-32.png?v=20260729-v63", {
    type:"image/png",
    sizes:"32x32"
  });
  upsertLink("shortcut icon", "favicon.ico?v=20260729-v63");
  upsertLink("apple-touch-icon", "assets/icons/apple-touch-icon.png?v=20260729-v63", {
    sizes:"180x180"
  });
  upsertLink("manifest", "manifest.webmanifest?v=20260729-v63");
}

function setupAccountShortcut() {
  const header = qs(".header");
  if (!header || qs(".account-shortcut", header)) return;
  const link = document.createElement("a");
  link.className = "account-shortcut";
  link.href = "minha-conta.html";
  link.setAttribute("aria-label", "Minha conta");
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.5-5 3.2-7 8-7s7.5 2 8 7"/></svg>';
  header.appendChild(link);
}

document.addEventListener("DOMContentLoaded", () => {
  setupOnlyCarsAppMetadata();
  setupAccountShortcut();
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
  setupValuesStack();
  setupPageHeroParallax();
  setupLiquidGlass();
  updateCartCount();
});
