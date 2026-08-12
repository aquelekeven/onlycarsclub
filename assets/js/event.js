(function () {
  "use strict";

  const root = document.querySelector("[data-event-page]");
  const client = window.OnlySupabase;
  if (!root || !client) return;

  const status = root.querySelector("[data-event-status]");
  const buyButtons = [...root.querySelectorAll("[data-event-buy]")];
  const lotPrice = root.querySelector(".event-current-lot strong");
  const remaining = root.querySelector("[data-event-remaining]");
  const money = (cents) => new Intl.NumberFormat("pt-BR", {
    style:"currency", currency:"BRL", maximumFractionDigits:0
  }).format(Number(cents || 0) / 100);

  function setSaleState(event) {
    const isOpen = event?.status === "sales_open" && Number(event.remaining_public || 0) > 0;
    const isSoldOut = Number(event?.remaining_public || 0) <= 0;

    buyButtons.forEach((button) => {
      button.disabled = !isOpen;
      button.textContent = isOpen ? "Comprar ingresso Expo" : isSoldOut ? "Ingressos esgotados" : "Vendas em breve";
      if (isOpen) button.dataset.saleOpen = "true";
      else delete button.dataset.saleOpen;
    });

    if (status) {
      status.innerHTML = `<i aria-hidden="true"></i>${isOpen
        ? `${event.remaining_public} vagas públicas disponíveis`
        : isSoldOut
          ? "Capacidade Expo esgotada"
          : "Aguardando a liberação segura das vendas"}`;
    }
    if (remaining && Number.isFinite(Number(event?.remaining_public))) {
      remaining.textContent = `${event.remaining_public} vagas públicas disponíveis`;
    }
  }

  function renderCurrentLot(lots) {
    const current = Array.isArray(lots) ? lots.find((lot) => lot.active) : null;
    if (current && lotPrice) lotPrice.textContent = money(current.price_cents);
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
