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

  const exchangeStatusLabels = {
    received:"Solicitação recebida", under_review:"Em análise", awaiting_return:"Aguardando devolução",
    return_in_transit:"Devolução em trânsito", received_return:"Produto recebido", exchange_sent:"Troca enviada",
    refunded:"Reembolso realizado", rejected:"Solicitação não aprovada", cancelled:"Cancelada", completed:"Concluída"
  };

  function openExchangeModal(order, user) {
    let modal = qs("[data-exchange-modal]");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "exchange-modal";
      modal.dataset.exchangeModal = "";
      modal.innerHTML = '<div class="exchange-modal-dialog" data-exchange-dialog></div>';
      document.body.appendChild(modal);
    }
    const items = Array.isArray(order.order_items) ? order.order_items : [];
    const dialog = qs("[data-exchange-dialog]", modal);
    dialog.innerHTML = `
      <header><div><p class="eyebrow">Atendimento pós-compra</p><h2>Troca ou devolução</h2><span>${escapeHtml(order.order_number)}</span></div><button type="button" data-exchange-close aria-label="Fechar">×</button></header>
      <form data-exchange-form>
        <div class="exchange-policy"><strong>Resolva tudo por aqui</strong><p>Arrependimento em até 7 dias do recebimento; troca voluntária de tamanho ou cor em até 30 dias. A primeira troca voluntária tem frete por conta da Only.</p><a href="termos.html" target="_blank" rel="noopener">Ver regras completas</a></div>
        <label><span>Produto</span><select name="item" required>${items.map((item,index) => `<option value="${index}">${escapeHtml(item.product_name)} · ${escapeHtml(item.color || "Sem cor")}${item.size ? ` · Tam. ${escapeHtml(item.size)}` : ""}</option>`).join("")}</select></label>
        <div class="exchange-form-grid"><label><span>Motivo</span><select name="request_type" required><option value="size_exchange">Trocar tamanho</option><option value="color_exchange">Trocar cor</option><option value="withdrawal">Desistir da compra</option><option value="defect">Produto com defeito</option><option value="wrong_item">Recebi o item incorreto</option><option value="other">Outro problema</option></select></label><label><span>O que você prefere?</span><select name="requested_solution" required><option value="exchange">Receber uma troca</option><option value="refund">Receber reembolso</option><option value="support">Quero orientação</option></select></label></div>
        <div class="exchange-form-grid" data-exchange-preferences><label><span>Novo tamanho (se aplicável)</span><input name="new_size" maxlength="20" placeholder="Ex.: G"></label><label><span>Nova cor (se aplicável)</span><input name="new_color" maxlength="40" placeholder="Ex.: Preto"></label></div>
        <label><span>Conte o que aconteceu</span><textarea name="details" minlength="5" maxlength="1500" required placeholder="Descreva o pedido de troca ou devolução..."></textarea></label>
        <label class="exchange-files"><span>Fotos do produto <small>(até 3 arquivos de 5 MB)</small></span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple><em data-exchange-photo-help>Obrigatórias para defeito ou item incorreto.</em></label>
        <p data-exchange-feedback role="status"></p>
        <footer><button type="button" class="secondary" data-exchange-close>Agora não</button><button type="submit">Enviar solicitação</button></footer>
      </form>`;
    const form = qs("[data-exchange-form]", dialog);
    const close = () => { modal.classList.remove("visible"); document.body.classList.remove("modal-open"); };
    qsa("[data-exchange-close]", dialog).forEach((button) => button.onclick = close);
    modal.onclick = (event) => { if (event.target === modal) close(); };
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = qs("[data-exchange-feedback]", form);
      const files = [...form.photos.files];
      if (files.length > 3) { feedback.textContent = "Envie no máximo 3 fotos."; return; }
      if (["defect","wrong_item"].includes(form.request_type.value) && !files.length) { feedback.textContent = "Envie ao menos uma foto para este motivo."; return; }
      if (files.some((file) => file.size > 5242880 || !["image/jpeg","image/png","image/webp"].includes(file.type))) { feedback.textContent = "Use imagens JPG, PNG ou WebP de até 5 MB."; return; }
      const button = qs("button[type='submit']", form);
      button.disabled = true; button.textContent = "Enviando..."; feedback.textContent = "Salvando sua solicitação com segurança...";
      try {
        const requestId = crypto.randomUUID();
        const photoPaths = [];
        for (let index=0; index<files.length; index+=1) {
          const extension = files[index].type.split("/")[1].replace("jpeg","jpg");
          const path = `${user.id}/${requestId}/foto-${index+1}.${extension}`;
          await client.uploadPrivateFile("exchange-evidence", path, files[index]);
          photoPaths.push(path);
        }
        const item = items[Number(form.item.value)];
        await client.rest("rpc/customer_create_exchange_request", { method:"POST", body:{
          p_request_id:requestId, p_order_id:order.id, p_request_type:form.request_type.value,
          p_requested_solution:form.requested_solution.value,
          p_items:[{ product_name:item.product_name, size:item.size, color:item.color, quantity:item.quantity, new_size:form.new_size.value.trim() || null, new_color:form.new_color.value.trim() || null }],
          p_details:form.details.value.trim(), p_photo_paths:photoPaths
        }});
        feedback.textContent = "Solicitação enviada. Você poderá acompanhar pelo pedido.";
        window.setTimeout(() => location.reload(), 700);
      } catch (error) { feedback.textContent = friendlyError(error); button.disabled=false; button.textContent="Enviar solicitação"; }
    });
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("visible"));
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
    const addressList = qs("[data-address-list]");
    const addressEditor = qs("[data-address-editor]");
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
      const ordersWithExchange = `orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,status,fulfillment_status,delivery_method,subtotal_cents,shipping_cents,total_cents,shipping_quote,expires_at,created_at,order_items(product_name,size,color,quantity,unit_price_cents,line_total_cents,metadata),shipments(service_name,carrier_name,status,tracking_code,tracking_url,posted_at,delivered_at,updated_at),order_fiscal_documents(access_key,danfe_path,xml_path,issued_at),order_exchange_requests(id,request_type,requested_solution,status,items,details,photo_paths,customer_message,return_tracking_code,return_tracking_url,replacement_tracking_code,replacement_tracking_url,created_at,updated_at)&order=created_at.desc&limit=20`;
      const ordersWithoutExchange = `orders?user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,status,fulfillment_status,delivery_method,subtotal_cents,shipping_cents,total_cents,shipping_quote,expires_at,created_at,order_items(product_name,size,color,quantity,unit_price_cents,line_total_cents,metadata),shipments(service_name,carrier_name,status,tracking_code,tracking_url,posted_at,delivered_at,updated_at),order_fiscal_documents(access_key,danfe_path,xml_path,issued_at)&order=created_at.desc&limit=20`;
      const [profiles, addresses, orders] = await Promise.all([
        client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,display_name,phone,tax_id`),
        client.rest(`addresses?user_id=eq.${encodeURIComponent(user.id)}&select=id,label,recipient_name,postal_code,street,number,complement,neighborhood,city,state,is_default,created_at&order=is_default.desc,created_at.asc&limit=3`),
        client.rest(ordersWithExchange).catch(() => client.rest(ordersWithoutExchange))
      ]);
      const profile = profiles?.[0] || {};
      savedAddresses = Array.isArray(addresses) ? addresses : [];
      const address = savedAddresses.find((item) => item.is_default) || savedAddresses[0] || null;

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
      if (adminLink) adminLink.hidden = profile.role !== "admin";
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

      const resetAddressEditor = (addressToEdit = null) => {
        addressForm.reset();
        addressForm.elements.address_id.value = addressToEdit?.id || "";
        if (addressToEdit) Object.entries(addressToEdit).forEach(([key, value]) => {
          if (addressForm.elements[key]) addressForm.elements[key].value = value ?? "";
        });
        addressForm.elements.is_default.checked = Boolean(addressToEdit?.is_default || !savedAddresses.length);
        noNumberInput.checked = String(addressToEdit?.number || "").toUpperCase() === "S/N";
        applyNoNumber();
        addressEditor.hidden = false;
        addressEditor.scrollIntoView({ behavior:"smooth", block:"nearest" });
      };
      const renderAddressList = () => {
        if (!addressList) return;
        addressList.innerHTML = savedAddresses.length ? savedAddresses.map((item) => `
          <article class="account-address-card ${item.is_default ? "is-default" : ""}" data-address-id="${escapeHtml(item.id)}">
            <header><span>${escapeHtml(item.label || "Endereço")}</span>${item.is_default ? "<b>Principal</b>" : ""}</header>
            <strong>${escapeHtml(item.street)}, ${escapeHtml(item.number || "S/N")}</strong>
            <p>${escapeHtml(item.neighborhood)} · ${escapeHtml(item.city)}/${escapeHtml(item.state)} · CEP ${escapeHtml(String(item.postal_code).replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</p>
            <footer><button type="button" data-address-edit>Editar</button>${item.is_default ? "" : '<button type="button" data-address-default>Tornar principal</button>'}<button type="button" class="danger" data-address-delete>Excluir</button></footer>
          </article>`).join("") : '<div class="account-address-empty"><strong>Nenhum endereço salvo</strong><span>Cadastre o primeiro endereço para agilizar suas compras.</span></div>';
        const addButton = qs("[data-address-add]");
        if (addButton) {
          addButton.disabled = savedAddresses.length >= 3;
          addButton.textContent = savedAddresses.length >= 3 ? "Limite de 3 atingido" : "+ Novo endereço";
        }
      };
      renderAddressList();
      qs("[data-address-add]")?.addEventListener("click", () => resetAddressEditor());
      qs("[data-address-editor-cancel]")?.addEventListener("click", () => { addressEditor.hidden = true; addressForm.reset(); });
      addressList?.addEventListener("click", async (event) => {
        const card = event.target.closest("[data-address-id]");
        const item = savedAddresses.find((entry) => entry.id === card?.dataset.addressId);
        if (!item) return;
        if (event.target.closest("[data-address-edit]")) return resetAddressEditor(item);
        if (event.target.closest("[data-address-default]")) {
          await client.rest("rpc/set_default_customer_address", { method:"POST", body:{ p_address_id:item.id } });
          location.reload();
          return;
        }
        const deleteButton = event.target.closest("[data-address-delete]");
        if (deleteButton) {
          if (deleteButton.dataset.confirm !== "true") {
            deleteButton.dataset.confirm = "true";
            deleteButton.textContent = "Confirmar exclusão";
            window.setTimeout(() => { deleteButton.dataset.confirm = ""; deleteButton.textContent = "Excluir"; }, 3500);
            return;
          }
          await client.rest("rpc/delete_customer_address", { method:"POST", body:{ p_address_id:item.id } });
          location.reload();
        }
      });

      const paidAndActive = (orders || []).filter((order) => order.status === "paid" && !["completed", "cancelled"].includes(order.fulfillment_status));
      const pendingOrders = (orders || []).filter((order) => order.status === "pending_payment");
      qs("[data-account-total-orders]").textContent = (orders || []).length;
      qs("[data-account-active-orders]").textContent = paidAndActive.length;
      qs("[data-account-pending-orders]").textContent = pendingOrders.length;
      qs("[data-account-order-badge]").textContent = (orders || []).length;
      const addressPreview = qs("[data-account-address-preview]");
      if (addressPreview && address) addressPreview.innerHTML = `<strong>${escapeHtml(address.street)}, ${escapeHtml(address.number || "S/N")}</strong><span>${escapeHtml(address.neighborhood)} · ${escapeHtml(address.city)}/${escapeHtml(address.state)} · CEP ${escapeHtml(String(address.postal_code || "").replace(/^(\d{5})(\d{3})$/, "$1-$2"))}</span>`;
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
          const fiscalDocument = Array.isArray(order.order_fiscal_documents) ? order.order_fiscal_documents[0] : order.order_fiscal_documents;
          const exchangeRequest = Array.isArray(order.order_exchange_requests) ? [...order.order_exchange_requests].sort((left,right) => new Date(right.created_at)-new Date(left.created_at))[0] : order.order_exchange_requests;
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
          const fiscalBox = order.status === "paid" && (isShipping || fiscalDocument) ? `<section class="order-fiscal" aria-label="Nota fiscal do pedido">
            <div><span>Documento fiscal</span><strong>${fiscalDocument ? "Nota fiscal disponível" : "Nota fiscal em processamento"}</strong><small>${fiscalDocument ? `Emitida em ${new Date(fiscalDocument.issued_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}` : "Ela será emitida antes da postagem do pedido."}</small></div>
            ${fiscalDocument ? `<div class="order-fiscal-actions"><button type="button" data-fiscal-download="${escapeHtml(fiscalDocument.danfe_path)}" data-fiscal-filename="${escapeHtml(order.order_number)}-DANFE.pdf">Baixar DANFE</button><button type="button" class="secondary" data-fiscal-download="${escapeHtml(fiscalDocument.xml_path)}" data-fiscal-filename="${escapeHtml(order.order_number)}-NFe.xml">Baixar XML</button></div>` : '<i aria-hidden="true">⌛</i>'}
            <p data-fiscal-feedback role="status"></p>
          </section>` : "";
          const exchangeBox = order.status === "paid" ? `<section class="order-exchange ${exchangeRequest ? "has-request" : ""}">
            ${exchangeRequest ? `<div><span>Troca ou devolução</span><strong>${escapeHtml(exchangeStatusLabels[exchangeRequest.status] || exchangeRequest.status)}</strong><small>Solicitada em ${new Date(exchangeRequest.created_at).toLocaleString("pt-BR")}</small>${exchangeRequest.customer_message ? `<p>${escapeHtml(exchangeRequest.customer_message)}</p>` : ""}${exchangeRequest.return_tracking_code ? `<p><b>Devolução:</b> ${escapeHtml(exchangeRequest.return_tracking_code)}</p>` : ""}${exchangeRequest.replacement_tracking_code ? `<p><b>Nova entrega:</b> ${escapeHtml(exchangeRequest.replacement_tracking_code)}</p>` : ""}</div>${["received","under_review"].includes(exchangeRequest.status) ? `<button type="button" class="secondary" data-exchange-cancel="${escapeHtml(exchangeRequest.id)}">Cancelar solicitação</button>` : ""}` : `<div><span>Precisa de ajuda com este pedido?</span><strong>Troca ou devolução</strong><small>Abra e acompanhe sua solicitação sem sair do site.</small></div><button type="button" data-exchange-open>Solicitar</button>`}
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
              ${fiscalBox}
              ${timeline}
              ${exchangeBox}
              ${pending ? `
                <div class="order-customer-actions">
                  ${expired ? "" : '<button type="button" data-order-action="resume">Voltar para pagamento</button>'}
                  <button type="button" class="danger" data-order-action="cancel">Cancelar pedido</button>
                </div>
                <p class="order-action-feedback" data-order-feedback aria-live="polite"></p>` : ""}
            </article>`;
        }).join("");

        ordersList.addEventListener("click", async (event) => {
          const fiscalButton = event.target.closest("[data-fiscal-download]");
          if (fiscalButton) {
            const fiscalFeedback = qs("[data-fiscal-feedback]", fiscalButton.closest(".order-fiscal"));
            fiscalButton.disabled = true;
            if (fiscalFeedback) fiscalFeedback.textContent = "Preparando download seguro...";
            try {
              const url = await client.createPrivateDownload("fiscal-documents", fiscalButton.dataset.fiscalDownload, 120);
              const link = document.createElement("a");
              link.href = url;
              link.download = fiscalButton.dataset.fiscalFilename || "nota-fiscal";
              link.rel = "noopener";
              document.body.appendChild(link);
              link.click();
              link.remove();
              if (fiscalFeedback) fiscalFeedback.textContent = "Download iniciado.";
            } catch (error) {
              if (fiscalFeedback) fiscalFeedback.textContent = error.message;
            } finally {
              fiscalButton.disabled = false;
            }
            return;
          }
          const exchangeOpen = event.target.closest("[data-exchange-open]");
          if (exchangeOpen) {
            const row = exchangeOpen.closest("[data-order-id]");
            const order = orders.find((item) => item.id === row?.dataset.orderId);
            if (order) openExchangeModal(order, user);
            return;
          }
          const exchangeCancel = event.target.closest("[data-exchange-cancel]");
          if (exchangeCancel) {
            exchangeCancel.disabled = true;
            try { await client.rest("rpc/customer_cancel_exchange_request", { method:"POST", body:{ p_request_id:exchangeCancel.dataset.exchangeCancel } }); location.reload(); }
            catch (error) { exchangeCancel.disabled=false; exchangeCancel.textContent=friendlyError(error); }
            return;
          }
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
        try {
          await client.rest("rpc/save_customer_address", { method:"POST", body:{
            p_address_id:addressForm.elements.address_id.value || null,
            p_label:addressForm.elements.label.value.trim(), p_recipient_name:addressForm.recipient_name.value.trim(),
            p_postal_code:addressForm.postal_code.value.replace(/\D/g, ""), p_street:addressForm.street.value.trim(),
            p_number:addressForm.number.value.trim(), p_complement:addressForm.complement.value.trim() || null,
            p_neighborhood:addressForm.neighborhood.value.trim(), p_city:addressForm.city.value.trim(),
            p_state:addressForm.state.value.trim().toUpperCase(), p_is_default:addressForm.elements.is_default.checked
          }});
          setFeedback(addressForm, "Endereço salvo.", "success");
          window.setTimeout(() => location.reload(), 450);
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
