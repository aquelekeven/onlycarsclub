(function () {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  })[character]);
  const formatMoney = (cents) => (Number(cents || 0) / 100)
    .toLocaleString("pt-BR", { style:"currency", currency:"BRL" })
    .replace(/[\u00a0\u202f]/g, " ");

  const messages = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar.",
    "User already registered": "Já existe uma conta com este e-mail.",
    "Password should be at least 6 characters": "A senha precisa ter pelo menos 8 caracteres.",
    "Unable to validate email address: invalid format": "Digite um e-mail válido.",
    "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "For security purposes, you can only request this after": "Aguarde alguns segundos antes de tentar novamente."
  };

  function friendlyError(error) {
    const original = error?.message || "Não foi possível concluir. Tente novamente.";
    const known = Object.entries(messages).find(([key]) => original.includes(key));
    return known ? known[1] : original;
  }

  function confirmOrderCancellation(orderNumber, trigger) {
    return new Promise((resolve) => {
      let modal = qs("[data-order-cancel-modal]");
      if (!modal) {
        modal = document.createElement("div");
        modal.className = "confirm-modal order-cancel-modal";
        modal.dataset.orderCancelModal = "";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "order-cancel-title");
        modal.innerHTML = `
          <div class="confirm-modal-dialog">
            <span class="confirm-modal-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01"/><path d="M10.3 3.7 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/></svg>
            </span>
            <p class="order-cancel-eyebrow">Ação permanente</p>
            <h2 id="order-cancel-title">Cancelar pedido?</h2>
            <strong data-order-cancel-number></strong>
            <p>O link de pagamento será desativado e este número de pedido não poderá ser reutilizado.</p>
            <div class="order-cancel-warning"><i aria-hidden="true"></i><span>Se você já pagou, não cancele. Aguarde a confirmação ou fale com a Only.</span></div>
            <div class="confirm-modal-actions">
              <button type="button" class="confirm-modal-cancel" data-order-cancel-keep>Manter pedido</button>
              <button type="button" class="confirm-modal-delete" data-order-cancel-confirm>Sim, cancelar</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }
      qs("[data-order-cancel-number]", modal).textContent = orderNumber;
      const keep = qs("[data-order-cancel-keep]", modal);
      const confirm = qs("[data-order-cancel-confirm]", modal);
      let closed = false;
      const close = (answer) => {
        if (closed) return;
        closed = true;
        modal.classList.remove("visible");
        document.body.classList.remove("modal-open");
        document.removeEventListener("keydown", onKeydown);
        window.setTimeout(() => {
          trigger?.focus();
          resolve(answer);
        }, 180);
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") close(false);
      };
      keep.onclick = () => close(false);
      confirm.onclick = () => close(true);
      modal.onclick = (event) => {
        if (event.target === modal) close(false);
      };
      document.addEventListener("keydown", onKeydown);
      document.body.classList.add("modal-open");
      requestAnimationFrame(() => {
        modal.classList.add("visible");
        keep.focus();
      });
    });
  }

  function setFeedback(form, text, type = "error") {
    const target = qs("[data-form-feedback]", form);
    if (!target) return;
    target.textContent = text;
    target.dataset.type = type;
    target.setAttribute("role", type === "error" ? "alert" : "status");
  }

  function setSubmitting(form, submitting, label = "Aguarde...") {
    const button = qs("button[type='submit']", form);
    if (!button) return;
    if (submitting) button.dataset.originalLabel = button.textContent;
    button.disabled = submitting;
    button.textContent = submitting ? label : button.dataset.originalLabel || button.textContent;
    form.setAttribute("aria-busy", String(submitting));
  }

  function validPassword(password) {
    return password.length >= 8;
  }

  function setupPasswordToggles() {
    qsa("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = qs(`#${button.dataset.togglePassword}`);
        if (!input) return;
        const visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.textContent = visible ? "Mostrar" : "Ocultar";
        button.setAttribute("aria-pressed", String(!visible));
      });
    });
  }

  function setupLogin() {
    const form = qs("[data-login-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setFeedback(form, "");
      setSubmitting(form, true, "Entrando...");
      try {
        await client.signIn({
          email: form.email.value.trim(),
          password: form.password.value
        });
        const requestedNext = new URLSearchParams(location.search).get("next");
        location.replace(requestedNext === "entrega.html" ? "entrega.html" : "minha-conta.html");
      } catch (error) {
        setFeedback(form, friendlyError(error));
        setSubmitting(form, false);
      }
    });
  }

  function setupSignup() {
    const form = qs("[data-signup-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setFeedback(form, "");
      const password = form.password.value;
      if (!validPassword(password)) return setFeedback(form, "A senha precisa ter pelo menos 8 caracteres.");
      if (password !== form.password_confirmation.value) return setFeedback(form, "As senhas não coincidem.");
      if (!form.privacy.checked) return setFeedback(form, "Aceite a Política de Privacidade para continuar.");
      setSubmitting(form, true, "Criando conta...");
      try {
        const result = await client.signUp({
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          password
        });
        if (result?.access_token) {
          location.replace("minha-conta.html");
          return;
        }
        form.reset();
        setFeedback(form, "Conta criada. Enviamos um link de confirmação para o seu e-mail.", "success");
      } catch (error) {
        setFeedback(form, friendlyError(error));
      } finally {
        setSubmitting(form, false);
      }
    });
  }

  function setupRecovery() {
    const form = qs("[data-recovery-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setFeedback(form, "");
      setSubmitting(form, true, "Enviando...");
      try {
        await client.sendPasswordReset(form.email.value.trim());
        setFeedback(form, "Se o e-mail estiver cadastrado, você receberá o link para criar uma nova senha.", "success");
      } catch (error) {
        setFeedback(form, friendlyError(error));
      } finally {
        setSubmitting(form, false);
      }
    });
  }

  async function setupPasswordUpdate(redirect) {
    const form = qs("[data-password-form]");
    if (!form) return;
    const session = redirect?.type === "recovery" ? redirect.session : null;
    if (!session) {
      form.hidden = true;
      qs("[data-invalid-recovery]").hidden = false;
      return;
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setFeedback(form, "");
      const password = form.password.value;
      if (!validPassword(password)) return setFeedback(form, "A senha precisa ter pelo menos 8 caracteres.");
      if (password !== form.password_confirmation.value) return setFeedback(form, "As senhas não coincidem.");
      setSubmitting(form, true, "Salvando...");
      try {
        await client.updatePassword(password);
        setFeedback(form, "Senha atualizada. Você já pode acessar sua conta.", "success");
        form.reset();
      } catch (error) {
        setFeedback(form, friendlyError(error));
      } finally {
        setSubmitting(form, false);
      }
    });
  }

  function setupEmailConfirmation(redirect) {
    const page = qs("[data-confirmation-page]");
    if (!page) return;
    const loading = qs("[data-confirmation-loading]", page);
    const success = qs("[data-confirmation-success]", page);
    const failure = qs("[data-confirmation-error]", page);
    const failureMessage = qs("[data-confirmation-error-message]", page);

    loading.hidden = true;
    if (redirect?.session && ["signup", "email"].includes(redirect.type)) {
      success.hidden = false;
      return;
    }

    failure.hidden = false;
    if (redirect?.error && failureMessage) {
      failureMessage.textContent = "O link de confirmação é inválido, expirou ou já foi utilizado.";
    }
  }

  function formatCpf(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    return digits.length > 10
      ? digits.replace(/(\d{2})(\d{5})(\d{1,4})/, "($1) $2-$3")
      : digits.replace(/(\d{2})(\d{4})(\d{1,4})/, "($1) $2-$3");
  }

  function titleCase(value) {
    const keepLower = new Set(["da", "das", "de", "do", "dos", "e"]);
    return String(value || "").trim().toLocaleLowerCase("pt-BR").split(/\s+/).map((part, index) => {
      if (!part) return "";
      if (index > 0 && keepLower.has(part)) return part;
      return part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1);
    }).join(" ");
  }

  function showAccountView(name) {
    qsa("[data-account-tab]").forEach((button) => button.classList.toggle("active", button.dataset.accountTab === name));
    qsa("[data-account-view]").forEach((view) => {
      const active = view.dataset.accountView === name;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });
    if (window.innerWidth < 820) qs("[data-account-content]")?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function loadAccount(user) {
    const loading = qs("[data-account-loading]");
    const guest = qs("[data-account-guest]");
    const content = qs("[data-account-content]");
    const profileForm = qs("[data-profile-form]");
    const addressForm = qs("[data-address-form]");
    const ordersList = qs("[data-orders-list]");
    let addressId = null;
    let savedAddresses = [];
    const orderStatusLabels = {
      pending_payment: "Aguardando pagamento",
      paid: "Pago",
      cancelled: "Cancelado",
      refunded: "Reembolsado",
      chargeback: "Contestação"
    };

    if (!user) {
      loading.hidden = true;
      guest.hidden = false;
      return;
    }

    try {
      await client.invokeFunction("mercado-pago-pedido", { action:"cleanup" }).catch(() => null);
      const [profiles, addresses, orders, ticketOrders] = await Promise.all([
        client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,display_name,phone,tax_id`),
        client.rest(`addresses?user_id=eq.${encodeURIComponent(user.id)}&select=id,label,recipient_name,postal_code,street,number,complement,neighborhood,city,state,is_default,created_at&order=is_default.desc,created_at.asc&limit=3`),
        client.rest(`orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,status,fulfillment_status,delivery_method,subtotal_cents,shipping_cents,total_cents,shipping_quote,expires_at,created_at,order_items(product_name,size,color,quantity,unit_price_cents,line_total_cents,metadata),shipments(service_name,carrier_name,status,tracking_code,tracking_url,posted_at,delivered_at,updated_at)&order=created_at.desc&limit=20`),
        client.rest("rpc/customer_event_tickets", { method:"POST", body:{} }).catch(() => [])
      ]);
      const profile = profiles?.[0] || {};
      savedAddresses = Array.isArray(addresses) ? addresses : [];
      const address = savedAddresses.find((item) => item.is_default) || savedAddresses[0] || null;
      addressId = address?.id || null;

      const displayName = profile.display_name || user.email.split("@")[0];
      qsa("[data-account-name]").forEach((element) => element.textContent = displayName);
      qs("[data-account-greeting]").textContent = displayName.split(" ")[0];
      qs("[data-account-initial]").textContent = displayName.trim().charAt(0).toUpperCase() || "O";
      qs("[data-account-email]").textContent = user.email;
      qs("[data-security-email]").textContent = user.email;
      const role = qs("[data-account-role]");
      role.textContent = profile.role === "admin" ? "Administrador" : "Cliente";
      role.dataset.role = profile.role || "customer";
      const adminLink = qs("[data-admin-link]");
      if (adminLink) {
        if (profile.role === "admin") adminLink.hidden = false;
        else adminLink.remove();
      }
      profileForm.display_name.value = profile.display_name || "";
      profileForm.phone.value = profile.phone ? formatPhone(profile.phone) : "";
      profileForm.tax_id.value = profile.tax_id ? formatCpf(profile.tax_id) : "";

      qsa("input", profileForm).forEach((input) => input.defaultValue = input.value);
      const postalCodeInput = addressForm.postal_code;
      const numberInput = addressForm.number;
      const noNumberInput = addressForm.no_number;
      const applyNoNumber = () => {
        if (!numberInput || !noNumberInput) return;
        numberInput.readOnly = noNumberInput.checked;
        numberInput.required = !noNumberInput.checked;
        if (noNumberInput.checked) numberInput.value = "S/N";
        else if (numberInput.value === "S/N") numberInput.value = "";
      };
      if (numberInput?.value.trim().toUpperCase() === "S/N") noNumberInput.checked = true;
      applyNoNumber();
      noNumberInput?.addEventListener("change", applyNoNumber);
      addressForm.addEventListener("reset", () => window.setTimeout(applyNoNumber));
      let postalCodeTimer = null;
      postalCodeInput?.addEventListener("input", () => {
        clearTimeout(postalCodeTimer);
        const postalCode = postalCodeInput.value.replace(/\D/g, "");
        if (postalCode.length !== 8) return;
        postalCodeTimer = setTimeout(async () => {
          setFeedback(addressForm, "Buscando endereço...");
          try {
            const response = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`, { headers:{ Accept:"application/json" } });
            const result = await response.json();
            if (!response.ok || result?.erro) throw new Error("CEP não encontrado.");
            const fields = { street:result.logradouro, neighborhood:result.bairro, city:result.localidade, state:result.uf };
            Object.entries(fields).forEach(([name, value]) => { if (addressForm.elements[name] && value) addressForm.elements[name].value = value; });
            setFeedback(addressForm, "Endereço localizado. Agora informe o número.", "success");
            if (!noNumberInput?.checked) numberInput?.focus();
          } catch (error) { setFeedback(addressForm, friendlyError(error)); }
        }, 250);
      });

      const paidAndActive = (orders || []).filter((order) => order.status === "paid" && !["completed", "cancelled"].includes(order.fulfillment_status));
      const pendingOrders = (orders || []).filter((order) => order.status === "pending_payment");
      qs("[data-account-total-orders]").textContent = (orders || []).length;
      qs("[data-account-active-orders]").textContent = paidAndActive.length;
      qs("[data-account-pending-orders]").textContent = pendingOrders.length;
      qs("[data-account-order-badge]").textContent = (orders || []).length;
      const tickets = Array.isArray(ticketOrders) ? ticketOrders : [];
      const ticketBadge = qs("[data-account-ticket-badge]");
      if (ticketBadge) ticketBadge.textContent = tickets.length;
      const ticketsRoot = qs("[data-account-tickets]");
      const ticketStatusLabels = { reserved:"Aguardando pagamento", active:"Ingresso confirmado", checked_in:"Entrada validada", cancelled:"Cancelado", refunded:"Reembolsado", blocked:"Bloqueado" };
      const ticketCard = (ticket) => {
        const paid = ticket.order_status === "paid" && ["active", "checked_in"].includes(ticket.ticket_status);
        const vehicleName = titleCase([ticket.vehicle_make, ticket.vehicle_model].filter(Boolean).join(" "));
        const driverName = titleCase(ticket.driver_name);
        return `<article class="account-ticket-card ${paid ? "is-active" : ""}">
          <header><div><span>${escapeHtml(ticket.event_name || "Only Cars Meeting")}</span><strong>${escapeHtml(ticket.ticket_code)}</strong></div><b>${escapeHtml(ticketStatusLabels[ticket.ticket_status] || ticket.ticket_status)}</b></header>
          <div class="account-ticket-body"><div class="account-ticket-car"><i><svg viewBox="0 0 32 20" aria-hidden="true"><path d="M3 14.5h2.5l1.8-5.2h15.2l3.8 5.2H29v2.2h-2.2M9.2 16.7h11.9M9.5 9.3l3-4h6l4 4"/><circle cx="7.4" cy="16.1" r="2.3"/><circle cx="24.4" cy="16.1" r="2.3"/></svg></i><div><strong>${escapeHtml(vehicleName)}</strong><span>${escapeHtml(String(ticket.vehicle_plate || "").toUpperCase())} · ${escapeHtml(driverName)}</span></div></div>
          <dl><div><dt>Lote</dt><dd>${escapeHtml(ticket.lot_name || "Lote 1")}</dd></div><div><dt>Valor</dt><dd>${formatMoney(ticket.total_cents)}</dd></div><div><dt>Data</dt><dd>${ticket.event_starts_at ? new Date(ticket.event_starts_at).toLocaleDateString("pt-BR") : "23/10/2026"}</dd></div><div><dt>Local</dt><dd>${escapeHtml(ticket.venue_name || "Centro de Esportes Radicais")}</dd></div></dl></div>
          <footer>${paid && ticket.qr_token ? `<div class="account-ticket-approved"><div><strong>Ingresso liberado</strong><span>Apresente este QR Code na portaria. Não compartilhe com terceiros.</span><button type="button" data-copy-ticket-token="${escapeHtml(ticket.qr_token)}">Copiar credencial manual</button></div><canvas data-ticket-qr="${escapeHtml(ticket.qr_token)}" aria-label="QR Code do ingresso ${escapeHtml(ticket.ticket_code)}"></canvas></div><form class="account-ticket-photo" data-ticket-photo-form data-ticket-id="${escapeHtml(ticket.id)}"><div><strong>Foto para o post de confirmado</strong><span>Envie uma foto horizontal ou vertical do carro. A equipe Only revisará antes da publicação.</span></div><label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required><span>Escolher foto</span></label><label class="account-ticket-consent"><input type="checkbox" name="consent" required><span>Autorizo a Only Cars Club a utilizar esta foto na divulgação do evento.</span></label><button type="submit">Enviar foto</button><p data-ticket-photo-feedback></p></form>` : `<div><strong>Pagamento em confirmação</strong><span>A credencial será liberada automaticamente após a aprovação.</span></div>`}</footer>
        </article>`;
      };
      if (ticketsRoot) {
        const grouped = tickets.reduce((result, ticket) => {
          const key = ticket.event_id || ticket.event_name || "evento";
          (result[key] ||= []).push(ticket);
          return result;
        }, {});
        ticketsRoot.innerHTML = tickets.length ? Object.values(grouped).map((eventTickets, index) => {
          const event = eventTickets[0];
          return `<article class="account-event-card"><button type="button" data-account-event-toggle="event-${index}"><div><span>Evento</span><strong>${escapeHtml(event.event_name || "Only Cars Meeting")}</strong><small>${event.event_starts_at ? new Date(event.event_starts_at).toLocaleDateString("pt-BR") : "Data a confirmar"} · ${escapeHtml(event.venue_name || "Local a confirmar")}</small></div><b>${eventTickets.length} ${eventTickets.length === 1 ? "ingresso" : "ingressos"}</b><i>→</i></button><div class="account-event-tickets" data-account-event="event-${index}" hidden>${eventTickets.map(ticketCard).join("")}</div></article>`;
        }).join("") : '<div class="account-empty"><strong>Nenhum evento na sua conta.</strong><span>Quando você comprar um ingresso Expo, o evento aparecerá aqui.</span><a href="proximo-evento.html">Ver o próximo evento</a></div>';
      }
      if (window.OnlyQRCode) {
        qsa("[data-ticket-qr]", ticketsRoot).forEach((canvas) => window.OnlyQRCode.toCanvas(canvas, canvas.dataset.ticketQr, { width:260, margin:3, errorCorrectionLevel:"L", color:{ dark:"#000000", light:"#ffffff" } }).catch(() => { canvas.hidden = true; }));
      }
      ticketsRoot?.addEventListener("click", async (event) => {
        const toggle = event.target.closest("[data-account-event-toggle]");
        if (toggle) {
          const panel = qs(`[data-account-event="${toggle.dataset.accountEventToggle}"]`, ticketsRoot);
          if (panel) panel.hidden = !panel.hidden;
          toggle.classList.toggle("active", panel && !panel.hidden);
          return;
        }
        const button = event.target.closest("[data-copy-ticket-token]");
        if (!button) return;
        try {
          await navigator.clipboard.writeText(button.dataset.copyTicketToken);
          button.textContent = "Credencial copiada";
        } catch (_) {
          button.textContent = "Não foi possível copiar";
        }
      });

      ticketsRoot?.addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-ticket-photo-form]");
        if (!form) return;
        event.preventDefault();
        const file = form.photo.files?.[0];
        const feedback = qs("[data-ticket-photo-feedback]", form);
        if (!file || !form.consent.checked) return;
        if (file.size > 8 * 1024 * 1024) { feedback.textContent = "A foto deve ter no máximo 8 MB."; return; }
        const submit = qs("button[type='submit']", form);
        submit.disabled = true;
        feedback.textContent = "Enviando foto...";
        try {
          const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
          const path = `${user.id}/${form.dataset.ticketId}/${crypto.randomUUID()}.${extension}`;
          await client.upload("ticket-confirmations", path, file);
          await client.rest("ticket_media?on_conflict=ticket_id", { method:"POST", headers:{ Prefer:"resolution=merge-duplicates,return=minimal" }, body:{ ticket_id:form.dataset.ticketId, owner_user_id:user.id, storage_path:path, publication_consent:true, publication_consent_at:new Date().toISOString(), status:"pending" } });
          feedback.textContent = "Foto enviada para revisão da equipe Only.";
          form.photo.value = "";
        } catch (error) { feedback.textContent = friendlyError(error); }
        finally { submit.disabled = false; }
      });
      const addressPreview = qs("[data-account-address-preview]");
      if (addressPreview && address) addressPreview.innerHTML = `<strong>${escapeHtml(address.street)}, ${escapeHtml(address.number || "S/N")}</strong><span>${escapeHtml(address.neighborhood)} · ${escapeHtml(address.city)}/${escapeHtml(address.state)} · CEP ${escapeHtml(String(address.postal_code || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</span>`;
      const addressList = qs("[data-address-list]");
      const addressEditor = qs("[data-address-editor]");
      const addressAdd = qs("[data-address-add]");
      const renderAddresses = () => {
        if (!addressList) return;
        addressList.innerHTML = savedAddresses.length ? savedAddresses.map((item) => `<article class="account-address-card ${item.is_default ? "is-default" : ""}" data-address-id="${escapeHtml(item.id)}"><header><span>${escapeHtml(item.label || "Endereço")}</span>${item.is_default ? "<b>Principal</b>" : ""}</header><strong>${escapeHtml(item.street)}, ${escapeHtml(item.number || "S/N")}</strong><p>${escapeHtml(item.neighborhood)} · ${escapeHtml(item.city)}/${escapeHtml(item.state)}<br>CEP ${escapeHtml(String(item.postal_code || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</p><footer><button type="button" data-address-action="edit">Editar</button>${item.is_default ? "" : '<button type="button" data-address-action="default">Tornar principal</button>'}<button type="button" class="danger" data-address-action="delete">Excluir</button></footer></article>`).join("") : '<div class="account-address-empty"><strong>Nenhum endereço cadastrado</strong><span>Adicione seu primeiro endereço para agilizar o checkout.</span></div>';
        if (addressAdd) addressAdd.disabled = savedAddresses.length >= 3;
      };
      const openAddressEditor = (item = null) => {
        addressId = item?.id || null;
        addressForm.reset();
        addressForm.address_id.value = addressId || "";
        if (item) Object.entries(item).forEach(([key, value]) => {
          if (addressForm.elements[key]) addressForm.elements[key].value = value ?? "";
        });
        addressForm.is_default.checked = item ? Boolean(item.is_default) : savedAddresses.length === 0;
        if (item?.number?.toUpperCase() === "S/N") addressForm.no_number.checked = true;
        applyNoNumber();
        addressEditor.hidden = false;
        addressEditor.scrollIntoView({ behavior:"smooth", block:"start" });
      };
      renderAddresses();
      addressAdd?.addEventListener("click", () => {
        if (savedAddresses.length >= 3) return;
        openAddressEditor();
      });
      qs("[data-address-editor-cancel]")?.addEventListener("click", () => {
        addressEditor.hidden = true;
        addressId = null;
        addressForm.reset();
      });
      addressList?.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-address-action]");
        const card = button?.closest("[data-address-id]");
        if (!button || !card) return;
        const item = savedAddresses.find((entry) => entry.id === card.dataset.addressId);
        if (!item) return;
        if (button.dataset.addressAction === "edit") return openAddressEditor(item);
        button.disabled = true;
        try {
          if (button.dataset.addressAction === "default") {
            await client.rest(`addresses?user_id=eq.${encodeURIComponent(user.id)}&is_default=eq.true`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:{ is_default:false } });
            await client.rest(`addresses?id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:{ is_default:true } });
            savedAddresses = savedAddresses.map((entry) => ({ ...entry, is_default:entry.id === item.id }));
          } else if (button.dataset.addressAction === "delete") {
            if (!window.confirm(`Excluir o endereço “${item.label || "Endereço"}”?`)) { button.disabled = false; return; }
            await client.rest(`addresses?id=eq.${encodeURIComponent(item.id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method:"DELETE", headers:{ Prefer:"return=minimal" } });
            savedAddresses = savedAddresses.filter((entry) => entry.id !== item.id);
            if (item.is_default && savedAddresses[0]) {
              await client.rest(`addresses?id=eq.${encodeURIComponent(savedAddresses[0].id)}&user_id=eq.${encodeURIComponent(user.id)}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:{ is_default:true } });
              savedAddresses[0].is_default = true;
            }
          }
          renderAddresses();
          location.reload();
        } catch (error) { window.alert(friendlyError(error)); button.disabled = false; }
      });
      const recentOrders = qs("[data-account-recent-orders]");
      if (recentOrders) recentOrders.innerHTML = (orders || []).length
        ? orders.slice(0, 3).map((order) => `<button type="button" data-account-go="orders"><span><strong>${escapeHtml(order.order_number)}</strong><small>${new Date(order.created_at).toLocaleDateString("pt-BR")}</small></span><b>${escapeHtml(orderStatusLabels[order.status] || order.status)}</b><i>→</i></button>`).join("")
        : '<div class="account-overview-empty"><strong>Nada por aqui ainda</strong><span>Seu primeiro pedido vai aparecer neste espaço.</span></div>';

      if (!orders?.length) {
        ordersList.innerHTML = '<div class="account-empty"><strong>Nenhum pedido ainda.</strong><span>Quando a loja integrada entrar no ar, seus pedidos aparecerão aqui.</span></div>';
      } else {
        ordersList.innerHTML = orders.map((order) => {
          const pending = order.status === "pending_payment";
          const expired = pending && order.expires_at && new Date(order.expires_at).getTime() <= Date.now();
          const statusLabel = expired ? "Pagamento expirado" : (orderStatusLabels[order.status] || order.status.replaceAll("_", " "));
          const deliveryLabels = {
            shipping:"Envio para o endereço",
            event_pickup:"Retirada no próximo evento",
            personal_pickup:"Retirada pessoal",
            customer_courier:"Motoboy por conta do cliente"
          };
          const items = Array.isArray(order.order_items) ? order.order_items : [];
          const itemsSummary = items.map((item) => {
            const backorderQuantity = Number(item.metadata?.backorder_quantity || 0);
            const details = [item.color, item.size ? `Tam. ${item.size}` : "", `${item.quantity}x`].filter(Boolean).map(escapeHtml).join(" · ");
            return `
              <li>
                <div><strong>${escapeHtml(item.product_name)}</strong><span>${details}</span>${backorderQuantity > 0 ? `<small>${backorderQuantity} ${backorderQuantity === 1 ? "unidade sob encomenda" : "unidades sob encomenda"} · até ${Number(item.metadata?.production_days || 10)} dias úteis</small>` : ""}</div>
                <strong>${formatMoney(item.line_total_cents ?? Number(item.unit_price_cents) * Number(item.quantity))}</strong>
              </li>`;
          }).join("");
          const shippingService = order.shipping_quote?.service_name ? ` · ${escapeHtml(order.shipping_quote.service_name)}` : "";
          const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments;
          const isShipping = order.delivery_method === "shipping";
          const fulfillmentSteps = isShipping
            ? [
                ["new","Pedido confirmado"], ["preparing","Em produção"], ["ready","Preparando envio"],
                ["shipped","Postado"], ["completed","Entregue"]
              ]
            : [
                ["new","Pedido confirmado"], ["preparing","Em produção"], ["ready","Pronto para retirada"],
                ["completed","Retirado"]
              ];
          const fulfillmentOrder = ["new","preparing","ready","shipped","completed"];
          const currentStep = fulfillmentOrder.indexOf(order.fulfillment_status);
          const timeline = order.status === "paid" ? `<section class="order-tracking" aria-label="Acompanhamento do pedido">
            <header><strong>${isShipping ? "Acompanhe seu envio" : "Acompanhe seu pedido"}</strong><span>${escapeHtml(fulfillmentSteps.find(([key]) => key === order.fulfillment_status)?.[1] || "Atualizando")}</span></header>
            <ol>${fulfillmentSteps.map(([key,label]) => {
              const stepIndex = fulfillmentOrder.indexOf(key);
              const state = order.fulfillment_status === "cancelled" ? "" : (stepIndex < currentStep ? "done" : stepIndex === currentStep ? "current" : "");
              return `<li class="${state}"><i aria-hidden="true"></i><span>${escapeHtml(label)}</span></li>`;
            }).join("")}</ol>
            ${shipment?.tracking_code ? `<div class="order-tracking-code"><span>Código de rastreio</span><strong>${escapeHtml(shipment.tracking_code)}</strong>${shipment.tracking_url ? `<a href="${escapeHtml(shipment.tracking_url)}" target="_blank" rel="noopener">Acompanhar entrega</a>` : ""}</div>` : ""}
          </section>` : "";
          return `
            <article class="order-row" data-order-id="${order.id}">
              <header class="order-row-header">
                <div class="order-row-main"><strong>${escapeHtml(order.order_number)}</strong><span>${new Date(order.created_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" })}</span></div>
                <span class="order-status" data-order-status>${escapeHtml(statusLabel)}</span>
              </header>
              <details class="order-details">
                <summary><span>Ver resumo do pedido</span><i aria-hidden="true"></i></summary>
                <div class="order-review">
                  <ul>${itemsSummary || "<li><span>Itens indisponíveis para exibição.</span></li>"}</ul>
                  <div class="order-delivery-summary"><span>${escapeHtml(deliveryLabels[order.delivery_method] || order.delivery_method)}${shippingService}</span></div>
                  <dl>
                    <div><dt>Produtos</dt><dd>${formatMoney(order.subtotal_cents)}</dd></div>
                    ${Number(order.shipping_cents) > 0 ? `<div><dt>Frete</dt><dd>${formatMoney(order.shipping_cents)}</dd></div>` : ""}
                    <div class="total"><dt>Total</dt><dd>${formatMoney(order.total_cents)}</dd></div>
                  </dl>
                </div>
              </details>
              ${timeline}
              ${pending ? `
                <div class="order-customer-actions">
                  ${expired ? "" : '<button type="button" data-order-action="resume">Voltar para pagamento</button>'}
                  <button type="button" class="danger" data-order-action="cancel">Cancelar pedido</button>
                </div>
                <p class="order-action-feedback" data-order-feedback aria-live="polite"></p>` : ""}
            </article>`;
        }).join("");

        ordersList.addEventListener("click", async (event) => {
          const button = event.target.closest("[data-order-action]");
          const row = button?.closest("[data-order-id]");
          if (!button || !row) return;
          const action = button.dataset.orderAction;
          if (action === "cancel") {
            const orderNumber = qs(".order-row-main strong", row)?.textContent || "Este pedido";
            if (!await confirmOrderCancellation(orderNumber, button)) return;
          }
          const feedback = qs("[data-order-feedback]", row);
          qsa("button", row).forEach((item) => item.disabled = true);
          feedback.textContent = action === "resume" ? "Recuperando pagamento..." : "Cancelando pedido...";
          try {
            const result = action === "cancel"
              ? await client.rest("rpc/customer_cancel_checkout_order", {
                  method:"POST",
                  body:{ p_order_id:row.dataset.orderId }
                })
              : await client.invokeFunction("mercado-pago-pedido", {
                  action,
                  order_id:row.dataset.orderId
                });
            if (action === "resume") {
              if (!result?.checkout_url) throw new Error("Link de pagamento indisponível.");
              location.assign(result.checkout_url);
              return;
            }
            feedback.textContent = "Pedido cancelado.";
            window.setTimeout(() => location.reload(), 500);
          } catch (error) {
            feedback.textContent = friendlyError(error);
            qsa("button", row).forEach((item) => item.disabled = false);
          }
        });
      }

      profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!profileForm.reportValidity()) return;
        const phoneDigits = profileForm.phone.value.replace(/\D/g, "");
        const cpfDigits = profileForm.tax_id.value.replace(/\D/g, "");
        if (phoneDigits && ![10, 11].includes(phoneDigits.length)) return setFeedback(profileForm, "Digite um telefone com DDD válido.");
        if (cpfDigits && cpfDigits.length !== 11) return setFeedback(profileForm, "Digite os 11 números do CPF.");
        setSubmitting(profileForm, true, "Salvando...");
        setFeedback(profileForm, "");
        try {
          await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: {
              display_name: profileForm.display_name.value.trim(),
              phone: phoneDigits || null,
              tax_id: cpfDigits || null
            }
          });
          const updatedName = profileForm.display_name.value.trim() || user.email.split("@")[0];
          qsa("[data-account-name]").forEach((element) => element.textContent = updatedName);
          qs("[data-account-greeting]").textContent = updatedName.split(" ")[0];
          qs("[data-account-initial]").textContent = updatedName.charAt(0).toUpperCase() || "O";
          setFeedback(profileForm, "Dados salvos.", "success");
        } catch (error) {
          setFeedback(profileForm, friendlyError(error));
        } finally {
          setSubmitting(profileForm, false);
        }
      });

      addressForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!addressForm.reportValidity()) return;
        if (addressForm.postal_code.value.replace(/\D/g, "").length !== 8) return setFeedback(addressForm, "Digite um CEP com 8 números.");
        if (!/^[A-Za-z]{2}$/.test(addressForm.state.value.trim())) return setFeedback(addressForm, "Digite a sigla do estado com 2 letras.");
        setSubmitting(addressForm, true, "Salvando...");
        setFeedback(addressForm, "");
        const payload = {
          user_id: user.id,
          label: addressForm.label.value.trim() || "Endereço",
          recipient_name: addressForm.recipient_name.value.trim(),
          postal_code: addressForm.postal_code.value.replace(/\D/g, ""),
          street: addressForm.street.value.trim(),
          number: addressForm.number.value.trim(),
          complement: addressForm.complement.value.trim() || null,
          neighborhood: addressForm.neighborhood.value.trim(),
          city: addressForm.city.value.trim(),
          state: addressForm.state.value.trim().toUpperCase(),
          is_default: addressForm.is_default.checked || savedAddresses.length === 0
        };
        try {
          if (payload.is_default) {
            await client.rest(`addresses?user_id=eq.${encodeURIComponent(user.id)}&is_default=eq.true`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:{ is_default:false } });
          }
          if (addressId) {
            await client.rest(`addresses?id=eq.${encodeURIComponent(addressId)}&user_id=eq.${encodeURIComponent(user.id)}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" }, body: payload
            });
          } else {
            if (savedAddresses.length >= 3) throw new Error("Você já possui o limite de três endereços salvos.");
            const created = await client.rest("addresses", {
              method: "POST", headers: { Prefer: "return=representation" }, body: payload
            });
            addressId = created?.[0]?.id || null;
          }
          setFeedback(addressForm, "Endereço salvo.", "success");
          window.setTimeout(() => location.reload(), 500);
        } catch (error) {
          setFeedback(addressForm, friendlyError(error));
        } finally {
          setSubmitting(addressForm, false);
        }
      });

      loading.hidden = true;
      content.hidden = false;
    } catch (error) {
      loading.innerHTML = `<strong>Não foi possível carregar sua conta.</strong><span>${friendlyError(error)}</span>`;
    }
  }

  async function setupAccount() {
    if (!qs("[data-account-page]")) return;
    qsa("[data-account-tab]").forEach((button) => button.addEventListener("click", () => showAccountView(button.dataset.accountTab)));
    qs("[data-account-content]")?.addEventListener("click", (event) => {
      const target = event.target.closest("[data-account-go]");
      if (target) showAccountView(target.dataset.accountGo);
    });
    const user = await client.getUser().catch(() => null);
    await loadAccount(user);
    const logout = qs("[data-logout]");
    logout?.addEventListener("click", async () => {
      logout.disabled = true;
      await client.signOut().catch(() => null);
      location.replace("login.html");
    });
  }

  function setupMasks() {
    qsa("[data-mask='cpf']").forEach((input) => input.addEventListener("input", () => input.value = formatCpf(input.value)));
    qsa("[data-mask='phone']").forEach((input) => input.addEventListener("input", () => input.value = formatPhone(input.value)));
    qsa("[data-mask='cep']").forEach((input) => input.addEventListener("input", () => {
      const digits = input.value.replace(/\D/g, "").slice(0, 8);
      input.value = digits.replace(/(\d{5})(\d)/, "$1-$2");
    }));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const redirect = client.consumeAuthRedirect();
    setupPasswordToggles();
    setupMasks();
    setupLogin();
    setupSignup();
    setupRecovery();
    setupEmailConfirmation(redirect);
    await setupPasswordUpdate(redirect);
    await setupAccount();
  });
})();
