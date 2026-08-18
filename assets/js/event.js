(function () {
  "use strict";

  const root = document.querySelector("[data-event-page]");
  const client = window.OnlySupabase;
  if (!root) return;

  const status = root.querySelector("[data-event-status]");
  const buyButtons = [...root.querySelectorAll("[data-event-buy]")];
  const lotPrice = root.querySelector(".event-current-lot strong");
  const remaining = root.querySelector("[data-event-remaining]");
  const lotName = root.querySelector(".event-current-lot span");
  const progressLabel = root.querySelector("[data-lot-progress-label]");
  const progressPercent = root.querySelector("[data-lot-progress-percent]");
  const progressBar = root.querySelector("[data-lot-progress-bar]");
  const progressDetail = root.querySelector("[data-lot-progress-detail]");
  let countdownTimer = null;
  const money = (cents) => new Intl.NumberFormat("pt-BR", {
    style:"currency", currency:"BRL", maximumFractionDigits:0
  }).format(Number(cents || 0) / 100);

  function setSaleState(event) {
    const currentLot = Array.isArray(event?.lots) ? event.lots.find((lot) => lot.active) : null;
    const lotTemporarilyFull = currentLot && Number(currentLot.sold_or_reserved || 0) >= Number(currentLot.capacity || 0);
    const isOpen = event?.status === "sales_open" && Number(event.remaining_public || 0) > 0 && !lotTemporarilyFull;
    const isSoldOut = Number(event?.remaining_public || 0) <= 0;

    buyButtons.forEach((button) => {
      button.disabled = !isOpen;
      button.textContent = isOpen ? "Comprar ingresso Expo" : isSoldOut ? "Ingressos esgotados" : lotTemporarilyFull ? "Vagas em pagamento" : "Vendas em breve";
      if (isOpen) button.dataset.saleOpen = "true";
      else delete button.dataset.saleOpen;
    });

    if (status) {
      status.innerHTML = `<i aria-hidden="true"></i>${isOpen
        ? `${event.remaining_public} vagas públicas disponíveis`
        : isSoldOut
          ? "Capacidade Expo esgotada"
          : lotTemporarilyFull
            ? "As vagas deste lote estão temporariamente reservadas"
            : "Aguardando a liberação segura das vendas"}`;
    }
    if (remaining && Number.isFinite(Number(event?.remaining_public))) {
      remaining.textContent = `${event.remaining_public} vagas públicas disponíveis`;
    }
  }

  function renderCurrentLot(lots) {
    const current = Array.isArray(lots) ? lots.find((lot) => lot.active) : null;
    if (!current) return;
    if (lotPrice) lotPrice.textContent = money(current.price_cents);
    if (lotName) lotName.textContent = `${current.name} aberto`;
    const occupied = Math.max(0, Number(current.sold_or_reserved || 0));
    const capacity = Math.max(1, Number(current.capacity || 1));
    const percent = Math.min(100, Math.round((occupied / capacity) * 100));
    if (progressLabel) progressLabel.textContent = `${current.name} em andamento`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressDetail) progressDetail.textContent = "O próximo lote abre automaticamente ao atingir 100%.";
  }

  function startCountdown(startsAt) {
    const target = new Date(startsAt).getTime();
    if (!Number.isFinite(target)) return;
    const fields = {
      days:root.querySelector("[data-countdown-days]"),
      hours:root.querySelector("[data-countdown-hours]"),
      minutes:root.querySelector("[data-countdown-minutes]"),
      seconds:root.querySelector("[data-countdown-seconds]")
    };
    const update = () => {
      const difference = Math.max(0, target - Date.now());
      const days = Math.floor(difference / 86400000);
      const hours = Math.floor((difference % 86400000) / 3600000);
      const minutes = Math.floor((difference % 3600000) / 60000);
      const seconds = Math.floor((difference % 60000) / 1000);
      if (fields.days) fields.days.textContent = String(days).padStart(2, "0");
      if (fields.hours) fields.hours.textContent = String(hours).padStart(2, "0");
      if (fields.minutes) fields.minutes.textContent = String(minutes).padStart(2, "0");
      if (fields.seconds) fields.seconds.textContent = String(seconds).padStart(2, "0");
      if (!difference && countdownTimer) clearInterval(countdownTimer);
    };
    update();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(update, 1000);
  }

  function initializeMemoryCarousel() {
    const carousel = root.querySelector("[data-event-carousel]");
    const track = carousel?.querySelector("[data-carousel-track]");
    if (!carousel || !track) return;

    const originalSlides = [...track.querySelectorAll("[data-carousel-slide]")];
    for (let index = originalSlides.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [originalSlides[index], originalSlides[randomIndex]] = [originalSlides[randomIndex], originalSlides[index]];
    }
    originalSlides.forEach((slide) => track.appendChild(slide));

    const slides = [...track.querySelectorAll("[data-carousel-slide]")];
    const dots = carousel.querySelector("[data-carousel-dots]");
    const currentLabel = carousel.querySelector("[data-carousel-current]");
    const totalLabel = carousel.querySelector("[data-carousel-total]");
    const previous = carousel.querySelector("[data-carousel-previous]");
    const next = carousel.querySelector("[data-carousel-next]");
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let activeIndex = 0;
    let autoplayTimer = null;
    let scrollTimer = null;

    if (totalLabel) totalLabel.textContent = String(slides.length).padStart(2, "0");

    const controls = slides.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", `Ver foto ${index + 1}`);
      button.addEventListener("click", () => show(index, true));
      dots?.appendChild(button);
      return button;
    });

    function updateState(index) {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
      });
      controls.forEach((control, controlIndex) => {
        const isActive = controlIndex === activeIndex;
        control.classList.toggle("is-active", isActive);
        control.setAttribute("aria-current", isActive ? "true" : "false");
      });
      if (currentLabel) currentLabel.textContent = String(activeIndex + 1).padStart(2, "0");
    }

    function restartAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      if (reduceMotion || document.hidden) return;
      autoplayTimer = setInterval(() => show(activeIndex + 1), 5000);
    }

    function show(index, manual = false) {
      const targetIndex = (index + slides.length) % slides.length;
      const targetSlide = slides[targetIndex];
      if (targetSlide) {
        const targetLeft = targetSlide.offsetLeft - ((track.clientWidth - targetSlide.offsetWidth) / 2);
        track.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: reduceMotion ? "auto" : "smooth"
        });
      }
      updateState(targetIndex);
      if (manual) restartAutoplay();
    }

    previous?.addEventListener("click", () => show(activeIndex - 1, true));
    next?.addEventListener("click", () => show(activeIndex + 1, true));
    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        show(activeIndex - 1, true);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        show(activeIndex + 1, true);
      }
    });
    track.addEventListener("scroll", () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const trackCenter = track.scrollLeft + track.clientWidth / 2;
        let closestIndex = 0;
        let closestDistance = Infinity;
        slides.forEach((slide, index) => {
          const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
          const distance = Math.abs(trackCenter - slideCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });
        updateState(closestIndex);
        restartAutoplay();
      }, 120);
    }, { passive:true });
    document.addEventListener("visibilitychange", restartAutoplay);

    updateState(0);
    requestAnimationFrame(() => show(0));
    restartAutoplay();
  }

  function initializeFlowProgress() {
    const flow = root.querySelector("[data-event-flow]");
    const steps = flow ? [...flow.querySelectorAll("li")] : [];
    if (!flow || !steps.length) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = flow.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      let progress;

      if (matchMedia("(max-width: 700px)").matches) {
        const marker = viewportHeight * 0.58;
        const first = steps[0].querySelector("i").getBoundingClientRect();
        const last = steps[steps.length - 1].querySelector("i").getBoundingClientRect();
        const firstCenter = first.top + first.height / 2;
        const lastCenter = last.top + last.height / 2;
        progress = (marker - firstCenter) / Math.max(1, lastCenter - firstCenter);
      } else {
        progress = ((viewportHeight * 0.72) - rect.top) / Math.max(1, rect.height * 0.72);
      }

      progress = Math.min(1, Math.max(0, progress));
      flow.style.setProperty("--flow-progress", progress.toFixed(4));
      const reachedIndex = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      steps.forEach((step, index) => step.classList.toggle("is-reached", progress > 0 && index <= reachedIndex));
    };

    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener("scroll", requestUpdate, { passive:true });
    addEventListener("resize", requestUpdate, { passive:true });
    update();
  }

  function initializeScheduleProgress() {
    const schedule = root.querySelector("[data-event-schedule]");
    const steps = schedule ? [...schedule.querySelectorAll("ol > li")] : [];
    if (!schedule || !steps.length) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const marker = viewportHeight * 0.6;
      const points = steps.map((step) => {
        const dot = step.querySelector("i").getBoundingClientRect();
        return dot.top + dot.height / 2;
      });
      const progress = Math.min(1, Math.max(0, (marker - points[0]) / Math.max(1, points[points.length - 1] - points[0])));
      schedule.style.setProperty("--schedule-progress", progress.toFixed(4));
      steps.forEach((step, index) => step.classList.toggle("is-reached", points[index] <= marker));
    };

    const requestUpdate = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener("scroll", requestUpdate, { passive:true });
    addEventListener("resize", requestUpdate, { passive:true });
    update();
  }

  async function loadEvent() {
    if (!client) return;
    try {
      const result = await client.publicRest("rpc/public_event_summary", {
        method:"POST",
        body:{ target_slug:root.dataset.eventSlug }
      });
      if (!result) return;
      root.dataset.eventId = result.id;
      setSaleState(result);
      renderCurrentLot(result.lots);
      startCountdown(result.starts_at);
    } catch (_) {
      // The static launch page remains usable while the event is still a draft
      // or before the database migration is applied.
    }
  }

  buyButtons.forEach((button) => button.addEventListener("click", async () => {
    if (button.dataset.saleOpen !== "true") return;
    if (!client) return;
    const session = await client.getSession().catch(() => null);
    const destination = `ingresso.html?event=${encodeURIComponent(root.dataset.eventSlug)}`;
    if (!session) {
      sessionStorage.setItem("onlycars.afterLogin", destination);
      location.href = "login.html?next=ingresso";
      return;
    }
    location.href = destination;
  }));

  initializeMemoryCarousel();
  initializeFlowProgress();
  initializeScheduleProgress();
  loadEvent();
})();
