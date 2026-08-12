(function () {
  "use strict";

  const root = document.querySelector("[data-event-page]");
  const client = window.OnlySupabase;
  if (!root || !client) return;

  const status = root.querySelector("[data-event-status]");
  const buyButtons = [...root.querySelectorAll("[data-event-buy]")];
  const lotsRoot = root.querySelector("[data-event-lots]");
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
          : "Preparando a abertura do Lote 1"}`;
    }
    if (remaining && Number.isFinite(Number(event?.remaining_public))) {
      remaining.textContent = `${event.remaining_public} vagas públicas disponíveis`;
    }
  }

  function renderLots(lots) {
    if (!lotsRoot || !Array.isArray(lots) || !lots.length) return;
    lotsRoot.innerHTML = lots.map((lot) => {
      const sold = Number(lot.sold_or_reserved || 0);
      const capacity = Number(lot.capacity || 0);
      const soldOut = capacity > 0 && sold >= capacity;
      const classes = ["event-lot", lot.active ? "active" : "", soldOut ? "sold-out" : ""].filter(Boolean).join(" ");
      return `<article class="${classes}">
        <span>${String(lot.name || `Lote ${lot.lot_number}`)}</span>
        <strong>${money(lot.price_cents)}</strong>
        <small>${soldOut ? "Esgotado" : `${Math.max(capacity - sold, 0)} de ${capacity} disponíveis`}</small>
        ${lot.active && !soldOut ? "<i>Lote atual</i>" : ""}
      </article>`;
    }).join("");
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
      renderLots(result.lots);
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
