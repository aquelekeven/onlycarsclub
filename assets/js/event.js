(function () {
  "use strict";

  const root = document.querySelector("[data-event-page]");
  const client = window.OnlySupabase;
  if (!root || !client) return;

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

  async function loadEvent() {
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
    const session = await client.getSession().catch(() => null);
    const destination = `ingresso.html?event=${encodeURIComponent(root.dataset.eventSlug)}`;
    if (!session) {
      sessionStorage.setItem("onlycars.afterLogin", destination);
      location.href = "login.html?next=ingresso";
      return;
    }
    location.href = destination;
  }));

  loadEvent();
})();
