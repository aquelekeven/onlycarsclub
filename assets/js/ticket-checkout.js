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
  let appliedCoupon = null;
  let buyerProfile = null;
  const vehiclesRoot = root.querySelector("[data-ticket-vehicles]");
  const addTicketButton = root.querySelector("[data-ticket-add]");
  const useAccountInput = root.querySelector("[data-ticket-use-account]");
  const accountDataLabel = root.querySelector("[data-ticket-account-data]");
  const money = (cents) => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(cents || 0) / 100);
  const digits = (value) => String(value || "").replace(/\D/g, "");
  const ageFrom = (value) => {
    if (!value) return -1;
    const birth = new Date(`${value}T12:00:00`), today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
  };
  const buyerNameInput = form.elements.buyer_name;
  const cpfInput = form.elements.buyer_tax_id;
  const phoneInput = form.elements.buyer_phone;
  const ticketCount = () => root.querySelectorAll("[data-ticket-vehicle]").length;
  const subtotalCents = () => Number(activeLot?.price_cents || 0) * ticketCount();

  function formatCpf(value) {
    const number = digits(value).slice(0, 11);
    return number
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }

  function formatPhone(value) {
    const number = digits(value).slice(0, 11);
    if (!number) return "";
    if (number.length <= 2) return `(${number}`;
    if (number.length <= 6) return `(${number.slice(0, 2)}) ${number.slice(2)}`;
    if (number.length <= 10) return `(${number.slice(0, 2)}) ${number.slice(2, 6)}-${number.slice(6)}`;
    return `(${number.slice(0, 2)}) ${number.slice(2, 7)}-${number.slice(7)}`;
  }

  form.addEventListener("input", (event) => {
    if (event.target.matches('[name="buyer_tax_id"],[data-ticket-holder-tax-id]')) event.target.value = formatCpf(event.target.value);
    if (event.target.matches('[name="buyer_phone"],[data-ticket-holder-phone]')) event.target.value = formatPhone(event.target.value);
  });
  const couponInput = root.querySelector("[data-ticket-coupon-code]");
  const couponButton = root.querySelector("[data-ticket-coupon-apply]");
  const couponFeedback = root.querySelector("[data-ticket-coupon-feedback]");

  function clearCoupon() {
    appliedCoupon = null;
    root.querySelector("[data-ticket-discount-line]").hidden = true;
    if (activeLot) root.querySelector("[data-ticket-total]").textContent = money(subtotalCents());
  }

  function updateTicketSummary() {
    const count = ticketCount();
    root.querySelector("[data-ticket-quantity]").textContent = `${count} ${count === 1 ? "ingresso" : "ingressos"}`;
    root.querySelector("[data-ticket-order-title]").textContent = count === 1 ? "Ingresso Expo" : `${count} Ingressos Expo`;
    root.querySelector("[data-ticket-order-description]").textContent = count === 1 ? "Entrada de um veículo na área de exposição." : "Entrada de dois veículos, cada um com seu próprio QR Code.";
    clearCoupon();
    if (couponInput.value.trim()) couponFeedback.textContent = "Aplique novamente o cupom para recalcular o total.";
    addTicketButton.disabled = count >= 2 || (eventData && Number(eventData.remaining_public || 0) <= count);
  }

  function setHolderMode(vehicle, otherPerson) {
    const fields = vehicle.querySelector("[data-ticket-holder-fields]");
    const inputs = fields ? [...fields.querySelectorAll("input")] : [];
    if (fields) fields.hidden = !otherPerson;
    inputs.forEach((input) => {
      input.required = otherPerson;
    });
    vehicle.classList.toggle("has-other-holder", otherPerson);
  }

  function prepareTicketVehicle(vehicle, index) {
    vehicle.dataset.ticketIndex = String(index);
    vehicle.querySelector("legend").textContent = `Ingresso Expo ${index}`;
    const holderNames = {
      "[data-ticket-holder-name]":`holder_name_${index}`,
      "[data-ticket-holder-tax-id]":`holder_tax_id_${index}`,
      "[data-ticket-holder-phone]":`holder_phone_${index}`
    };
    Object.entries(holderNames).forEach(([selector, name]) => {
      const input = vehicle.querySelector(selector);
      if (input) input.name = name;
    });
    const toggle = vehicle.querySelector("[data-ticket-other-holder]");
    if (toggle) toggle.checked = false;
    setHolderMode(vehicle, false);
  }

  const firstTicketVehicle = root.querySelector("[data-ticket-vehicle]");
  if (firstTicketVehicle) prepareTicketVehicle(firstTicketVehicle, 1);

  addTicketButton?.addEventListener("click", () => {
    if (ticketCount() >= 2) return;
    const first = root.querySelector("[data-ticket-vehicle]");
    const second = first.cloneNode(true);
    second.querySelectorAll("input").forEach((input) => { input.value = ""; input.removeAttribute("id"); });
    prepareTicketVehicle(second, 2);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ticket-vehicle-remove";
    remove.dataset.ticketRemove = "";
    remove.textContent = "Remover segundo ingresso";
    second.querySelector("legend").after(remove);
    vehiclesRoot.appendChild(second);
    updateTicketSummary();
    second.querySelector("input")?.focus();
  });
  vehiclesRoot?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-ticket-remove]");
    if (!remove) return;
    remove.closest("[data-ticket-vehicle]")?.remove();
    updateTicketSummary();
    addTicketButton.focus();
  });
  vehiclesRoot?.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-ticket-other-holder]");
    if (!toggle) return;
    const vehicle = toggle.closest("[data-ticket-vehicle]");
    if (vehicle) setHolderMode(vehicle, toggle.checked);
  });

  async function applyCoupon() {
    const code = String(couponInput.value || "").trim().toUpperCase();
    couponInput.value = code;
    clearCoupon();
    if (!code) { couponFeedback.textContent = "Digite o código do cupom."; return; }
    if (!eventData?.id || !activeLot) return;
    couponButton.disabled = true;
    couponFeedback.textContent = "Validando cupom...";
    try {
      const result = await client.rest("rpc/preview_ticket_purchase_coupon", { method:"POST", body:{ p_event_id:eventData.id, p_code:code, p_subtotal_cents:subtotalCents() } });
      appliedCoupon = result;
      root.querySelector("[data-ticket-coupon-label]").textContent = result.code;
      root.querySelector("[data-ticket-discount]").textContent = `− ${money(result.discount_cents)}`;
      root.querySelector("[data-ticket-discount-line]").hidden = false;
      root.querySelector("[data-ticket-total]").textContent = money(result.payable_cents);
      couponFeedback.textContent = result.description || "Cupom aplicado com sucesso.";
      couponFeedback.dataset.state = "success";
    } catch (couponError) {
      couponFeedback.textContent = couponError.message || "Não foi possível aplicar o cupom.";
      couponFeedback.dataset.state = "error";
    } finally { couponButton.disabled = false; }
  }
  couponButton?.addEventListener("click", applyCoupon);
  couponInput?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyCoupon(); } });
  couponInput?.addEventListener("input", () => { if (appliedCoupon && couponInput.value.trim().toUpperCase() !== appliedCoupon.code) { clearCoupon(); couponFeedback.textContent = "Aplique novamente após alterar o código."; } });

  useAccountInput?.addEventListener("change", () => {
    if (!useAccountInput.checked) {
      accountDataLabel.textContent = "Preenchimento automático desligado. Os dados atuais foram mantidos para você editar.";
      return;
    }
    if (!buyerProfile) {
      useAccountInput.checked = false;
      accountDataLabel.textContent = "Não foi possível carregar os dados da conta.";
      return;
    }
    buyerNameInput.value = buyerProfile.display_name || "";
    cpfInput.value = formatCpf(buyerProfile.tax_id || "");
    phoneInput.value = formatPhone(buyerProfile.phone || "");
    const missing = [buyerProfile.display_name, buyerProfile.tax_id, buyerProfile.phone].filter((value) => !value).length;
    accountDataLabel.textContent = missing ? "Preenchemos o que já estava salvo. Complete os dados restantes." : "Dados da conta aplicados. Você ainda pode editar antes de pagar.";
  });

  async function initialize() {
    const user = await client.getUser().catch(() => null);
    if (!user) {
      sessionStorage.setItem("onlycars.afterLogin", `${location.pathname.split("/").pop()}${location.search}`);
      location.replace("login.html?next=ingresso");
      return;
    }
    try {
      const profiles = await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=birth_date,display_name,phone,tax_id`);
      buyerProfile = profiles?.[0] || null;
      const birthDate = buyerProfile?.birth_date;
      if (!birthDate) throw new Error("Informe sua data de nascimento em Minha conta antes de comprar.");
      if (ageFrom(birthDate) < 18) throw new Error("Você pode visualizar o evento, mas o ingresso deve ser comprado na conta de um responsável com 18 anos completos ou mais.");
      eventData = await client.publicRest("rpc/public_event_summary", { method:"POST", body:{ target_slug:root.dataset.eventSlug } });
      activeLot = eventData?.lots?.find((lot) => lot.active);
      if (eventData?.status !== "sales_open" || !activeLot || Number(eventData.remaining_public || 0) <= 0) throw new Error("As vendas do Lote 1 ainda não estão abertas.");
      if (Number(activeLot.sold_or_reserved || 0) >= Number(activeLot.capacity || 0)) {
        throw new Error("As vagas deste lote estão temporariamente reservadas. Tente novamente em alguns minutos.");
      }
      root.querySelector("[data-ticket-lot]").textContent = activeLot.name;
      root.querySelector("[data-ticket-price]").textContent = money(activeLot.price_cents);
      root.querySelector("[data-ticket-total]").textContent = money(subtotalCents());
      const occupied = Math.max(0, Number(activeLot.sold_or_reserved || 0));
      const capacity = Math.max(1, Number(activeLot.capacity || 1));
      const percent = Math.min(100, Math.round((occupied / capacity) * 100));
      root.querySelector("[data-ticket-progress-label]").textContent = `${activeLot.name} em andamento`;
      root.querySelector("[data-ticket-progress-percent]").textContent = `${percent}%`;
      root.querySelector("[data-ticket-progress-bar]").style.width = `${percent}%`;
      root.querySelector("[data-ticket-progress-detail]").textContent = "O próximo lote abre automaticamente ao atingir 100%.";
      addTicketButton.disabled = Number(eventData.remaining_public || 0) < 2;
      submit.disabled = false;
    } catch (loadError) {
      error.textContent = loadError.message || "Não foi possível carregar o lote disponível.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!eventData || !activeLot || !form.reportValidity()) return;
    const data = new FormData(form);
    const buyerName = String(data.get("buyer_name") || "").trim();
    const cpf = digits(data.get("buyer_tax_id"));
    const phone = digits(data.get("buyer_phone"));
    const tickets = [...root.querySelectorAll("[data-ticket-vehicle]")].map((vehicle, index) => {
      const otherHolder = vehicle.querySelector("[data-ticket-other-holder]")?.checked;
      return {
        vehicle_plate:String(vehicle.querySelector('[name="vehicle_plate"]').value || "").replace(/[^a-z0-9]/gi, "").toUpperCase(),
        vehicle_make:String(vehicle.querySelector('[name="vehicle_make"]').value || "").trim(),
        vehicle_model:String(vehicle.querySelector('[name="vehicle_model"]').value || "").trim(),
        instagram_handle:String(vehicle.querySelector('[name="instagram_handle"]').value || "").trim(),
        driver_name:otherHolder ? String(vehicle.querySelector("[data-ticket-holder-name]").value || "").trim() : buyerName,
        driver_tax_id:otherHolder ? digits(vehicle.querySelector("[data-ticket-holder-tax-id]").value) : cpf,
        driver_phone:otherHolder ? digits(vehicle.querySelector("[data-ticket-holder-phone]").value) : phone,
        holder_is_buyer:!otherHolder,
        index:index + 1
      };
    });
    if (!buyerName) { error.textContent = "Informe o nome completo do comprador."; return; }
    if (cpf.length !== 11) { error.textContent = "Informe um CPF válido com 11 números."; return; }
    if (phone.length < 10 || phone.length > 11) { error.textContent = "Informe um WhatsApp válido com DDD."; return; }
    const invalidTicket = tickets.find((ticket) => ticket.vehicle_plate.length !== 7 || !ticket.vehicle_make || !ticket.vehicle_model);
    if (invalidTicket) { error.textContent = `Confira placa, marca e modelo do veículo ${invalidTicket.index}.`; return; }
    const invalidHolder = tickets.find((ticket) => !ticket.driver_name || ticket.driver_tax_id.length !== 11 || ticket.driver_phone.length < 10 || ticket.driver_phone.length > 11);
    if (invalidHolder) { error.textContent = `Confira nome, CPF e WhatsApp do titular do ingresso ${invalidHolder.index}.`; return; }
    if (new Set(tickets.map((ticket) => ticket.vehicle_plate)).size !== tickets.length) { error.textContent = "Cada ingresso precisa ter uma placa diferente."; return; }
    submit.disabled = true; submit.textContent = "Abrindo Mercado Pago..."; error.textContent = "";
    try {
      const response = await client.invokeFunction("mercado-pago-ingresso", {
        event_slug:root.dataset.eventSlug, lot_id:activeLot.id,
        buyer_name:buyerName, buyer_tax_id:cpf, buyer_phone:phone,
        tickets:tickets.map(({ index, ...ticket }) => ticket),
        coupon_code:appliedCoupon?.code || null
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
