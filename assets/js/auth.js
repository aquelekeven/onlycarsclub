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

  async function loadAccount(user) {
    const loading = qs("[data-account-loading]");
    const guest = qs("[data-account-guest]");
    const content = qs("[data-account-content]");
    const profileForm = qs("[data-profile-form]");
    const addressForm = qs("[data-address-form]");
    const ordersList = qs("[data-orders-list]");
    let addressId = null;
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
      const [profiles, addresses, orders] = await Promise.all([
        client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,display_name,phone,tax_id`),
        client.rest("addresses?select=id,label,recipient_name,postal_code,street,number,complement,neighborhood,city,state,is_default&order=is_default.desc,created_at.asc&limit=1"),
        client.rest("orders?select=id,order_number,status,fulfillment_status,delivery_method,subtotal_cents,shipping_cents,total_cents,shipping_quote,expires_at,created_at,order_items(product_name,size,color,quantity,unit_price_cents,line_total_cents,metadata),shipments(service_name,carrier_name,status,tracking_code,tracking_url,posted_at,delivered_at,updated_at)&order=created_at.desc&limit=20")
      ]);
      const profile = profiles?.[0] || {};
      const address = addresses?.[0] || null;
      addressId = address?.id || null;

      qs("[data-account-name]").textContent = profile.display_name || user.email.split("@")[0];
      qs("[data-account-email]").textContent = user.email;
      const role = qs("[data-account-role]");
      role.textContent = profile.role === "admin" ? "Administrador" : "Cliente";
      role.dataset.role = profile.role || "customer";
      const adminLink = qs("[data-admin-link]");
      if (adminLink) adminLink.hidden = profile.role !== "admin";
      profileForm.display_name.value = profile.display_name || "";
      profileForm.phone.value = profile.phone ? formatPhone(profile.phone) : "";
      profileForm.tax_id.value = profile.tax_id ? formatCpf(profile.tax_id) : "";

      if (address) {
        Object.entries(address).forEach(([key, value]) => {
          if (addressForm.elements[key]) addressForm.elements[key].value = value || "";
        });
      }

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
          const isCoordinatedPickup = ["personal_pickup", "customer_courier"].includes(order.delivery_method);
          const pickupMessage = [
            "Olá! Quero combinar a retirada do meu pedido da Only Cars Club.",
            "",
            `Pedido: ${order.order_number}`,
            `Modalidade: ${deliveryLabels[order.delivery_method] || order.delivery_method}`,
            "",
            "Itens:",
            ...items.map((item) => `- ${Number(item.quantity)}x ${item.product_name}${item.size ? ` · Tam. ${item.size}` : ""}${item.color ? ` · ${item.color}` : ""}`),
            `Total: ${formatMoney(order.total_cents)}`,
            "",
            "Podemos combinar a estação e o horário para retirada na Linha 3–Vermelha do Metrô, em São Paulo/SP?"
          ].join("\n");
          const pickupWhatsappUrl = `https://wa.me/5511976842147?text=${encodeURIComponent(pickupMessage)}`;
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
              ${isCoordinatedPickup && order.status === "paid" ? `
                <aside class="order-pickup-contact">
                  <div><strong>Combine sua retirada</strong><span>Disponível somente em São Paulo/SP, em uma estação combinada da Linha 3–Vermelha do Metrô.</span></div>
                  <a href="${escapeHtml(pickupWhatsappUrl)}" target="_blank" rel="noopener noreferrer">Combinar pelo WhatsApp</a>
                </aside>` : ""}
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
          qs("[data-account-name]").textContent = profileForm.display_name.value.trim() || user.email.split("@")[0];
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
          label: "Principal",
          recipient_name: addressForm.recipient_name.value.trim(),
          postal_code: addressForm.postal_code.value.replace(/\D/g, ""),
          street: addressForm.street.value.trim(),
          number: addressForm.number.value.trim(),
          complement: addressForm.complement.value.trim() || null,
          neighborhood: addressForm.neighborhood.value.trim(),
          city: addressForm.city.value.trim(),
          state: addressForm.state.value.trim().toUpperCase(),
          is_default: true
        };
        try {
          if (addressId) {
            await client.rest(`addresses?id=eq.${encodeURIComponent(addressId)}`, {
              method: "PATCH", headers: { Prefer: "return=minimal" }, body: payload
            });
          } else {
            const created = await client.rest("addresses", {
              method: "POST", headers: { Prefer: "return=representation" }, body: payload
            });
            addressId = created?.[0]?.id || null;
          }
          setFeedback(addressForm, "Endereço salvo.", "success");
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
