(function () {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  })[character]);
  const formatMoney = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

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
        client.rest("orders?select=id,order_number,status,fulfillment_status,delivery_method,subtotal_cents,shipping_cents,total_cents,shipping_quote,expires_at,created_at,order_items(product_name,size,color,quantity,unit_price_cents,line_total_cents,metadata)&order=created_at.desc&limit=20")
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
          return `
            <article class="order-row" data-order-id="${order.id}">
              <header class="order-row-header">
                <div class="order-row-main"><strong>${escapeHtml(order.order_number)}</strong><span>${new Date(order.created_at).toLocaleDateString("pt-BR")}</span></div>
                <span class="order-status" data-order-status>${escapeHtml(statusLabel)}</span>
              </header>
              <div class="order-review">
                <ul>${itemsSummary || "<li><span>Itens indisponíveis para exibição.</span></li>"}</ul>
                <div class="order-delivery-summary"><span>${escapeHtml(deliveryLabels[order.delivery_method] || order.delivery_method)}${shippingService}</span></div>
                <dl>
                  <div><dt>Produtos</dt><dd>${formatMoney(order.subtotal_cents)}</dd></div>
                  ${Number(order.shipping_cents) > 0 ? `<div><dt>Frete</dt><dd>${formatMoney(order.shipping_cents)}</dd></div>` : ""}
                  <div class="total"><dt>Total</dt><dd>${formatMoney(order.total_cents)}</dd></div>
                </dl>
              </div>
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
          if (action === "cancel" && !window.confirm("Cancelar este pedido? O link de pagamento deixará de funcionar.")) return;
          const feedback = qs("[data-order-feedback]", row);
          qsa("button", row).forEach((item) => item.disabled = true);
          feedback.textContent = action === "resume" ? "Recuperando pagamento..." : "Cancelando pedido...";
          try {
            const result = await client.invokeFunction("mercado-pago-pedido", {
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
