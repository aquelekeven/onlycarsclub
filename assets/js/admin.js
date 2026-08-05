(function () {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = { products: [], orders: [] };

  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateTime = (value) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const statusLabels = {
    pending_payment: "Aguardando pagamento", paid: "Pago", cancelled: "Cancelado",
    refunded: "Reembolsado", chargeback: "Contestação"
  };
  const fulfillmentLabels = {
    new: "Novo", preparing: "Em preparação", ready: "Pronto", shipped: "Enviado",
    completed: "Concluído", cancelled: "Cancelado"
  };

  function feedback(selector, message, type = "") {
    const element = qs(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
  }

  function selectOptions(labels, selected) {
    return Object.entries(labels).map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
  }

  function showTab(name) {
    qsa("[data-admin-tab]").forEach((button) => button.classList.toggle("active", button.dataset.adminTab === name));
    qsa("[data-admin-panel]").forEach((panel) => {
      const active = panel.dataset.adminPanel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  }

  function orderCard(order, compact = false) {
    const items = order.order_items || [];
    const itemText = items.length ? items.map((item) => `${item.quantity}× ${safe(item.product_name)}${item.size ? ` · ${safe(item.size)}` : ""}${item.color ? ` · ${safe(item.color)}` : ""}`).join("<br>") : "Itens ainda não registrados";
    if (compact) return `<article class="admin-order compact"><div><strong>${safe(order.order_number)}</strong><span>${safe(order.customer_name)} · ${dateTime(order.created_at)}</span></div><span class="admin-status" data-status="${order.status}">${statusLabels[order.status] || safe(order.status)}</span><strong>${money(order.total_cents)}</strong></article>`;
    return `<article class="admin-order" data-order-id="${order.id}" data-order-search-value="${safe(`${order.order_number} ${order.customer_name} ${order.customer_email}`.toLowerCase())}">
      <header><div><strong>${safe(order.order_number)}</strong><span>${dateTime(order.created_at)}</span></div><strong>${money(order.total_cents)}</strong></header>
      <div class="admin-order-grid"><div><span>Cliente</span><strong>${safe(order.customer_name)}</strong><small>${safe(order.customer_email)} · ${safe(order.customer_phone)}</small></div><div><span>Itens</span><p>${itemText}</p></div></div>
      <div class="admin-order-actions">
        <div class="admin-payment-state"><span>Pagamento</span><strong class="admin-status" data-status="${order.status}">${statusLabels[order.status] || safe(order.status)}</strong></div>
        <label><span>Preparação / envio</span><select data-fulfillment-status>${selectOptions(fulfillmentLabels, order.fulfillment_status)}</select></label>
        <button type="button" data-save-order>Salvar status</button>
      </div>
    </article>`;
  }

  function renderOrders() {
    const list = qs("[data-admin-orders]");
    const dashboard = qs("[data-dashboard-orders]");
    if (dashboard) dashboard.innerHTML = state.orders.length ? state.orders.slice(0, 5).map((order) => orderCard(order, true)).join("") : '<div class="account-empty"><strong>Nenhum pedido ainda.</strong><span>Os pedidos aparecerão aqui assim que o checkout estiver conectado.</span></div>';
    if (list) list.innerHTML = state.orders.length ? state.orders.map((order) => orderCard(order)).join("") : '<div class="account-empty"><strong>Nenhum pedido ainda.</strong><span>Os pedidos aparecerão aqui assim que o checkout estiver conectado.</span></div>';
  }

  function inventoryRow(product, variant) {
    const available = Math.max(0, variant.stock_quantity - variant.reserved_quantity);
    return `<article class="admin-stock-row" data-stock-search-value="${safe(`${product.name} ${variant.sku} ${variant.size || ""} ${variant.color || ""}`.toLowerCase())}">
      <div class="admin-stock-product"><strong>${safe(product.name)}</strong><span>${safe(variant.sku)}</span></div>
      <div class="admin-stock-tags"><span>${safe(variant.size || "Único")}</span><span>${safe(variant.color || "Padrão")}</span></div>
      <div class="admin-stock-numbers"><span>Reservado<strong>${variant.reserved_quantity}</strong></span><span>Disponível<strong>${available}</strong></span></div>
      <form data-stock-form data-variant-id="${variant.id}"><label><span>Estoque físico</span><input type="number" name="quantity" min="${variant.reserved_quantity}" max="99999" step="1" value="${variant.stock_quantity}" required></label><button type="submit">Salvar</button></form>
    </article>`;
  }

  function renderInventory() {
    const list = qs("[data-admin-inventory]");
    const content = state.products.map((product) => {
      const variants = product.product_variants || [];
      return `<section class="admin-product-group"><header><div><strong>${safe(product.name)}</strong><span>${safe(product.category || "Sem categoria")}</span></div><span>${variants.length} ${variants.length === 1 ? "variação" : "variações"}</span></header>${variants.map((variant) => inventoryRow(product, variant)).join("")}</section>`;
    }).join("");
    list.innerHTML = content || '<div class="account-empty"><strong>Catálogo ainda não importado.</strong><span>Execute a migração do catálogo no Supabase para liberar o preenchimento.</span></div>';
  }

  function renderStats() {
    const variants = state.products.flatMap((product) => product.product_variants || []).filter((variant) => variant.active);
    qs("[data-stat-orders]").textContent = state.orders.length;
    qs("[data-stat-pending]").textContent = state.orders.filter((order) => order.status === "pending_payment").length;
    qs("[data-stat-stock]").textContent = variants.reduce((total, variant) => total + Math.max(0, variant.stock_quantity - variant.reserved_quantity), 0);
    qs("[data-stat-zero]").textContent = variants.filter((variant) => variant.stock_quantity - variant.reserved_quantity <= 0).length;
  }

  async function loadData() {
    feedback("[data-orders-feedback]", "Atualizando pedidos...");
    feedback("[data-inventory-feedback]", "Atualizando estoque...");
    const [products, orders] = await Promise.all([
      client.rest("products?select=id,slug,name,category,active,product_variants(id,sku,size,color,price_cents,stock_quantity,reserved_quantity,active)&order=name.asc&product_variants.order=size.asc,color.asc"),
      client.rest("orders?select=id,order_number,customer_name,customer_email,customer_phone,status,fulfillment_status,delivery_method,total_cents,created_at,order_items(product_name,size,color,quantity)&order=created_at.desc&limit=50")
    ]);
    state.products = products || [];
    state.orders = orders || [];
    renderOrders();
    renderInventory();
    renderStats();
    feedback("[data-orders-feedback]", `${state.orders.length} pedido(s) carregado(s).`, "success");
    feedback("[data-inventory-feedback]", "Estoque atualizado.", "success");
  }

  function bindInteractions() {
    qsa("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.adminTab)));
    qsa("[data-open-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.openTab)));
    qsa("[data-admin-refresh]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      await loadData().catch((error) => feedback("[data-orders-feedback]", error.message, "error"));
      button.disabled = false;
    }));
    qs("[data-order-search]")?.addEventListener("input", (event) => {
      const term = event.target.value.trim().toLowerCase();
      qsa("[data-order-search-value]").forEach((row) => row.hidden = !row.dataset.orderSearchValue.includes(term));
    });
    qs("[data-stock-search]")?.addEventListener("input", (event) => {
      const term = event.target.value.trim().toLowerCase();
      qsa("[data-stock-search-value]").forEach((row) => row.hidden = !row.dataset.stockSearchValue.includes(term));
    });
    qs("[data-admin-inventory]")?.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-stock-form]");
      if (!form) return;
      event.preventDefault();
      const button = qs("button", form);
      const quantity = Number(form.quantity.value);
      button.disabled = true;
      button.textContent = "Salvando...";
      try {
        await client.rest("rpc/admin_set_variant_inventory", { method: "POST", body: { target_variant_id: form.dataset.variantId, new_stock_quantity: quantity } });
        await loadData();
        feedback("[data-inventory-feedback]", "Quantidade salva com sucesso.", "success");
      } catch (error) {
        feedback("[data-inventory-feedback]", error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Salvar";
      }
    });
    qs("[data-admin-orders]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-save-order]");
      if (!button) return;
      const card = button.closest("[data-order-id]");
      button.disabled = true;
      button.textContent = "Salvando...";
      try {
        await client.rest("rpc/admin_update_fulfillment_status", { method: "POST", body: { target_order_id: card.dataset.orderId, new_fulfillment_status: qs("[data-fulfillment-status]", card).value } });
        await loadData();
        feedback("[data-orders-feedback]", "Status do pedido atualizado.", "success");
      } catch (error) {
        feedback("[data-orders-feedback]", error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Salvar status";
      }
    });
  }

  async function initialize() {
    if (!qs("[data-admin-page]")) return;
    const loading = qs("[data-admin-loading]");
    const denied = qs("[data-admin-denied]");
    const content = qs("[data-admin-content]");
    try {
      const user = await client.getUser();
      if (!user) throw new Error("Faça login com uma conta administradora para continuar.");
      const profiles = await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role,display_name`);
      const profile = profiles?.[0];
      if (profile?.role !== "admin") throw new Error("Sua conta não possui permissão de administrador.");
      qs("[data-admin-name]").textContent = profile.display_name || "Administrador";
      qs("[data-admin-email]").textContent = user.email;
      await loadData();
      bindInteractions();
      loading.hidden = true;
      content.hidden = false;
    } catch (error) {
      loading.hidden = true;
      denied.hidden = false;
      qs("[data-admin-denied-message]").textContent = error.message || "Não foi possível validar seu acesso.";
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
