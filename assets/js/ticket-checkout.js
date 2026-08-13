(function () {
  "use strict";
  const root = document.querySelector("[data-ticket-checkout]");
  const client = window.OnlySupabase;
  if (!root || !client) return;
  const form = root.querySelector("[data-ticket-form]");
  const submit = root.querySelector("[data-ticket-submit]");
  const error = root.querySelector("[data-ticket-error]");
  let eventData = null;
  let activeLot = null;
  const money = (cents) => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(cents || 0) / 100);
  const digits = (value) => String(value || "").replace(/\D/g, "");

  async function initialize() {
    const user = await client.getUser().catch(() => null);
    if (!user) {
      sessionStorage.setItem("onlycars.afterLogin", `${location.pathname.split("/").pop()}${location.search}`);
      location.replace("login.html?next=ingresso");
      return;
    }
    try {
      eventData = await client.publicRest("rpc/public_event_summary", { method:"POST", body:{ target_slug:root.dataset.eventSlug } });
      activeLot = eventData?.lots?.find((lot) => lot.active);
      if (eventData?.status !== "sales_open" || !activeLot || Number(eventData.remaining_public || 0) <= 0) throw new Error("As vendas do Lote 1 ainda não estão abertas.");
      root.querySelector("[data-ticket-lot]").textContent = activeLot.name;
      root.querySelector("[data-ticket-price]").textContent = money(activeLot.price_cents);
      root.querySelector("[data-ticket-total]").textContent = money(activeLot.price_cents);
      submit.disabled = false;
    } catch (loadError) {
      error.textContent = loadError.message || "Não foi possível carregar o lote disponível.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!eventData || !activeLot || !form.reportValidity()) return;
    const data = new FormData(form);
    const cpf = digits(data.get("driver_tax_id"));
    const phone = digits(data.get("driver_phone"));
    const plate = String(data.get("vehicle_plate") || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (cpf.length !== 11) { error.textContent = "Informe um CPF válido com 11 números."; return; }
    if (phone.length < 10 || phone.length > 11) { error.textContent = "Informe um WhatsApp válido com DDD."; return; }
    if (plate.length !== 7) { error.textContent = "Informe uma placa válida com 7 caracteres."; return; }
    submit.disabled = true; submit.textContent = "Abrindo Mercado Pago..."; error.textContent = "";
    try {
      const response = await client.invokeFunction("mercado-pago-ingresso", {
        event_slug:root.dataset.eventSlug, lot_id:activeLot.id,
        driver_name:String(data.get("driver_name") || "").trim(), driver_tax_id:cpf, driver_phone:phone,
        vehicle_plate:plate, vehicle_make:String(data.get("vehicle_make") || "").trim(), vehicle_model:String(data.get("vehicle_model") || "").trim(),
        vehicle_year:Number(data.get("vehicle_year") || 0) || null, vehicle_color:String(data.get("vehicle_color") || "").trim(), instagram_handle:String(data.get("instagram_handle") || "").trim()
      });
      if (!response?.checkout_url) throw new Error("O Mercado Pago não retornou o link de pagamento.");
      location.assign(response.checkout_url);
    } catch (checkoutError) {
      error.textContent = checkoutError.message || "Não foi possível iniciar o pagamento.";
      submit.disabled = false; submit.textContent = "Continuar para o Mercado Pago";
    }
  });
  initialize();
})();
