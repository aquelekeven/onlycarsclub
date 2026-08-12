(function () {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const state = { products: [], orders: [], orderPage:1, orderPageSize:8, orderSearch:"", reportMode:"month", reportMonth:"", reportYear:new Date().getFullYear() };

  const money = (cents) => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dateTime = (value) => new Date(value).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  const statusLabels = {
    pending_payment: "Aguardando pagamento", paid: "Pago", cancelled: "Cancelado",
    refunded: "Reembolsado", chargeback: "Contestação"
  };
  const fulfillmentLabels = {
    new: "Pedido confirmado", preparing: "Em produção", ready: "Preparando envio / pronto para retirada", shipped: "Postado",
    completed: "Entregue / retirado", cancelled: "Cancelado"
  };
  const exchangeStatusLabels = { received:"Recebida",under_review:"Em análise",awaiting_return:"Aguardando devolução",return_in_transit:"Devolução em trânsito",received_return:"Produto recebido",exchange_sent:"Troca enviada",refunded:"Reembolso realizado",rejected:"Não aprovada",cancelled:"Cancelada",completed:"Concluída" };
  const exchangeTypeLabels = { size_exchange:"Troca de tamanho",color_exchange:"Troca de cor",defect:"Defeito",wrong_item:"Item incorreto",withdrawal:"Arrependimento",other:"Outro" };

  function feedback(selector, message, type = "") {
    const element = qs(selector);
    if (!element) return;
    element.textContent = message;
    element.dataset.type = type;
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
    if (compact) return `<article class="admin-order compact"><div><strong>${safe(order.order_number)}</strong><span>${safe(order.customer_name)} · ${dateTime(order.created_at)}</span></div><span class="admin-status" data-status="${order.status}">${statusLabels[order.status] || safe(order.status)}</span><strong>${money(order.total_cents)}</strong></article>`;
    const itemLabel = items.length === 1 ? items[0].product_name : `${items.reduce((total, item) => total + Number(item.quantity), 0)} itens`;
    return `<article class="admin-order admin-order-row" data-order-id="${order.id}" data-order-search-value="${safe(`${order.order_number} ${order.customer_name} ${order.customer_email} ${items.map((item) => item.product_name).join(" ")}`.toLowerCase())}">
      <div><strong>${safe(order.order_number)}</strong><span>${dateTime(order.created_at)}</span></div>
      <div><span>Cliente</span><strong>${safe(order.customer_name)}</strong></div>
      <div><span>Pedido</span><strong>${safe(itemLabel)}</strong></div>
      <span class="admin-status" data-status="${order.status}">${statusLabels[order.status] || safe(order.status)}</span>
      <strong>${money(order.total_cents)}</strong>
      <button type="button" data-open-order>Ver todos os detalhes</button>
    </article>`;
  }

  function addressText(address) {
    if (!address) return "Não se aplica a esta forma de entrega";
    return [
      `${address.street || ""}, ${address.number || "S/N"}`,
      address.complement,
      `${address.neighborhood || ""} · ${address.city || ""}/${address.state || ""}`,
      address.postal_code ? `CEP ${String(address.postal_code).replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : ""
    ].filter(Boolean).map(safe).join("<br>");
  }

  function orderItemImage(item) {
    return item.image_url || item.product_variants?.image_urls?.[0] || "";
  }

  function openOrderModal(order) {
    const modal = qs("[data-admin-order-modal]");
    const dialog = qs("[data-admin-order-dialog]", modal);
    const items = order.order_items || [];
    const shipment = Array.isArray(order.shipments) ? order.shipments[0] : order.shipments;
    const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
    const fiscalDocument = Array.isArray(order.order_fiscal_documents) ? order.order_fiscal_documents[0] : order.order_fiscal_documents;
    const exchangeRequest = Array.isArray(order.order_exchange_requests) ? [...order.order_exchange_requests].sort((left,right) => new Date(right.created_at)-new Date(left.created_at))[0] : order.order_exchange_requests;
    const isShipping = order.delivery_method === "shipping";
    const deliveryLabels = { shipping:"Envio para o endereço", event_pickup:"Retirada no próximo evento", personal_pickup:"Retirada pessoal", customer_courier:"Motoboy do cliente" };
    const steps = isShipping
      ? [["new","Confirmado"],["preparing","Em produção"],["ready","Preparando envio"],["shipped","Postado"],["completed","Entregue"]]
      : [["new","Confirmado"],["preparing","Em produção"],["ready","Pronto para retirada"],["completed","Retirado"]];
    const currentIndex = steps.findIndex(([key]) => key === order.fulfillment_status);
    dialog.dataset.orderId = order.id;
    dialog.dataset.fulfillmentStatus = order.fulfillment_status;
    dialog.innerHTML = `
      <header class="admin-order-modal-header"><div><p class="eyebrow">Detalhes completos</p><h2>${safe(order.order_number)}</h2><span>${dateTime(order.created_at)}</span></div><button type="button" data-close-order aria-label="Fechar">×</button></header>
      <div class="admin-order-modal-status"><span class="admin-status" data-status="${order.status}">${statusLabels[order.status] || safe(order.status)}</span><strong>${money(order.total_cents)}</strong></div>
      <section class="admin-order-modal-section"><h3>Produtos</h3><div class="admin-order-products">${items.map((item) => `<article><div class="admin-order-product-image">${orderItemImage(item) ? `<img src="${safe(orderItemImage(item))}" alt="">` : "<span>ONLY</span>"}</div><div><strong>${safe(item.product_name)}</strong><span>${[item.sku,item.color,item.size ? `Tam. ${item.size}` : ""].filter(Boolean).map(safe).join(" · ")}</span><small>${item.quantity} × ${money(item.unit_price_cents)}</small>${item.metadata?.backorder_quantity ? `<em>${item.metadata.backorder_quantity} sob encomenda · até ${item.metadata.production_days || 10} dias úteis</em>` : ""}</div><strong>${money(item.line_total_cents)}</strong></article>`).join("")}</div></section>
      <div class="admin-order-modal-columns">
        <section class="admin-order-modal-section"><h3>Cliente</h3><dl><div><dt>Nome</dt><dd>${safe(order.customer_name)}</dd></div><div><dt>E-mail</dt><dd>${safe(order.customer_email)}</dd></div><div><dt>Telefone</dt><dd>${safe(order.customer_phone)}</dd></div><div><dt>CPF</dt><dd>${safe(order.customer_tax_id || "Não informado")}</dd></div></dl></section>
        <section class="admin-order-modal-section"><h3>Entrega</h3><dl><div><dt>Modalidade</dt><dd>${safe(deliveryLabels[order.delivery_method] || order.delivery_method)}</dd></div><div><dt>Transportadora</dt><dd>${safe(shipment?.carrier_name || order.shipping_quote?.company_name || "—")}</dd></div><div><dt>Serviço</dt><dd>${safe(shipment?.service_name || order.shipping_quote?.service_name || "—")}</dd></div><div><dt>Frete</dt><dd>${money(order.shipping_cents)}</dd></div></dl><address>${addressText(order.shipping_address)}</address></section>
        <section class="admin-order-modal-section"><h3>Pagamento</h3><dl><div><dt>Status</dt><dd>${safe(payment?.status || statusLabels[order.status] || order.status)}</dd></div><div><dt>Método</dt><dd>${safe(payment?.payment_method || "—")}</dd></div><div><dt>Parcelas</dt><dd>${safe(payment?.installments || "—")}</dd></div><div><dt>ID Mercado Pago</dt><dd>${safe(payment?.provider_payment_id || "—")}</dd></div><div><dt>Aprovado em</dt><dd>${payment?.approved_at ? dateTime(payment.approved_at) : "—"}</dd></div></dl></section>
        <section class="admin-order-modal-section"><h3>Valores</h3><dl><div><dt>Produtos</dt><dd>${money(order.subtotal_cents)}</dd></div><div><dt>Desconto</dt><dd>${money(order.discount_cents)}</dd></div><div><dt>Frete</dt><dd>${money(order.shipping_cents)}</dd></div><div class="total"><dt>Total</dt><dd>${money(order.total_cents)}</dd></div></dl></section>
      </div>
      ${exchangeRequest ? `<section class="admin-order-modal-section admin-exchange-control" data-admin-exchange-id="${safe(exchangeRequest.id)}">
        <div class="admin-exchange-heading"><div><p class="eyebrow">Pós-compra</p><h3>Troca ou devolução</h3><p>${safe(exchangeTypeLabels[exchangeRequest.request_type] || exchangeRequest.request_type)} · aberta em ${dateTime(exchangeRequest.created_at)}</p></div><span>${safe(exchangeStatusLabels[exchangeRequest.status] || exchangeRequest.status)}</span></div>
        <div class="admin-exchange-summary"><strong>Solicitação do cliente</strong><p>${safe(exchangeRequest.details)}</p>${(exchangeRequest.items || []).map((item) => `<small>${safe(item.product_name)} · ${safe(item.color || "—")} · ${safe(item.size ? `Tam. ${item.size}` : "sem tamanho")}${item.new_size ? ` → Tam. ${safe(item.new_size)}` : ""}${item.new_color ? ` → ${safe(item.new_color)}` : ""}</small>`).join("")}</div>
        ${exchangeRequest.photo_paths?.length ? `<div class="admin-exchange-photos">${exchangeRequest.photo_paths.map((path,index) => `<button type="button" data-exchange-photo="${safe(path)}">Abrir foto ${index+1}</button>`).join("")}</div>` : ""}
        <div class="admin-exchange-fields"><label><span>Etapa</span><select data-exchange-status>${Object.entries(exchangeStatusLabels).map(([value,label]) => `<option value="${value}" ${exchangeRequest.status===value?"selected":""}>${label}</option>`).join("")}</select></label><label><span>Mensagem para o cliente</span><textarea data-exchange-customer-message placeholder="Orientações visíveis em Meus pedidos">${safe(exchangeRequest.customer_message || "")}</textarea></label><label><span>Observação interna</span><textarea data-exchange-admin-notes placeholder="Somente administradores">${safe(exchangeRequest.admin_notes || "")}</textarea></label><div><label><span>Rastreio da devolução</span><input data-exchange-return-code value="${safe(exchangeRequest.return_tracking_code || "")}"></label><label><span>Link da devolução</span><input type="url" data-exchange-return-url value="${safe(exchangeRequest.return_tracking_url || "")}"></label></div><div><label><span>Rastreio da nova entrega</span><input data-exchange-replacement-code value="${safe(exchangeRequest.replacement_tracking_code || "")}"></label><label><span>Link da nova entrega</span><input type="url" data-exchange-replacement-url value="${safe(exchangeRequest.replacement_tracking_url || "")}"></label></div></div>
        <div class="admin-order-modal-footer"><p data-exchange-admin-feedback role="status"></p><button type="button" data-save-exchange>Atualizar solicitação</button></div>
      </section>` : ""}
      <section class="admin-order-modal-section admin-fiscal-control" data-fiscal-control>
        <div class="admin-fiscal-heading"><div><p class="eyebrow">Documento fiscal</p><h3>Nota fiscal do pedido</h3><p>${fiscalDocument ? `NF-e registrada em ${dateTime(fiscalDocument.issued_at)}` : order.status === "paid" ? "Pagamento aprovado · aguardando emissão manual" : "Disponível após a aprovação do pagamento"}</p></div><span class="admin-fiscal-status" data-ready="${fiscalDocument ? "true" : "false"}">${fiscalDocument ? "NF-e disponível" : "NF-e pendente"}</span></div>
        <div class="admin-fiscal-guide">
          <strong>Emissão pelo Nota Fiscal Fácil</strong>
          <ol><li>Copie os dados do pedido.</li><li>Emita a NF-e no aplicativo NFF.</li><li>Exporte o DANFE em PDF e o XML.</li><li>Anexe os dois arquivos abaixo.</li></ol>
          <button type="button" data-copy-fiscal-data>Copiar dados para emissão</button>
        </div>
        <div class="admin-fiscal-fields">
          <label><span>Chave de acesso da NF-e</span><input inputmode="numeric" maxlength="54" data-fiscal-access-key value="${safe(fiscalDocument?.access_key || "")}" placeholder="44 números"></label>
          <label><span>Data e hora da emissão</span><input type="datetime-local" data-fiscal-issued-at value="${fiscalDocument?.issued_at ? new Date(new Date(fiscalDocument.issued_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16) : ""}"></label>
          <label class="admin-fiscal-file"><span>DANFE em PDF</span><input type="file" accept="application/pdf,.pdf" data-fiscal-danfe><small>${fiscalDocument ? "Selecione apenas se quiser substituir o PDF atual." : "Obrigatório · máximo de 5 MB"}</small></label>
          <label class="admin-fiscal-file"><span>XML autorizado</span><input type="file" accept="application/xml,text/xml,.xml" data-fiscal-xml><small>${fiscalDocument ? "Selecione apenas se quiser substituir o XML atual." : "Obrigatório · máximo de 5 MB"}</small></label>
        </div>
        ${fiscalDocument ? `<div class="admin-fiscal-downloads"><button type="button" data-admin-fiscal-download="${safe(fiscalDocument.danfe_path)}">Baixar DANFE atual</button><button type="button" data-admin-fiscal-download="${safe(fiscalDocument.xml_path)}">Baixar XML atual</button></div>` : ""}
        <div class="admin-order-modal-footer"><p data-fiscal-feedback role="status"></p><button type="button" data-save-fiscal ${order.status !== "paid" ? "disabled" : ""}>Salvar NF-e</button></div>
      </section>
      <section class="admin-order-modal-section admin-fulfillment-control"><div><h3>Processos do pedido</h3><p>Clique em uma etapa. As anteriores serão preenchidas automaticamente.</p></div><div class="admin-fulfillment-steps">${steps.map(([key,label], index) => `<button type="button" data-fulfillment-step="${key}" class="${index <= currentIndex ? "active" : ""}"><i>${index + 1}</i><span>${safe(label)}</span></button>`).join("")}</div>
        ${isShipping ? `<div class="admin-tracking-fields"><label><span>Código de rastreio</span><input data-tracking-code value="${safe(shipment?.tracking_code || "")}" placeholder="Ex.: ME123456789BR"></label><label><span>Link público</span><input type="url" data-tracking-url value="${safe(shipment?.tracking_url || "")}" placeholder="https://..."></label></div>` : ""}
        <div class="admin-order-modal-footer"><p data-modal-feedback role="status"></p><button type="button" data-save-order>Salvar acompanhamento</button></div>
      </section>
      <section class="admin-order-modal-section admin-technical-details"><details><summary>Dados técnicos e histórico</summary><dl><div><dt>ID interno</dt><dd>${safe(order.id)}</dd></div><div><dt>Criado</dt><dd>${dateTime(order.created_at)}</dd></div><div><dt>Atualizado</dt><dd>${dateTime(order.updated_at)}</dd></div><div><dt>Pago</dt><dd>${order.paid_at ? dateTime(order.paid_at) : "—"}</dd></div><div><dt>Expiração</dt><dd>${order.expires_at ? dateTime(order.expires_at) : "—"}</dd></div><div><dt>Preferência MP</dt><dd>${safe(payment?.provider_preference_id || "—")}</dd></div><div><dt>Detalhe MP</dt><dd>${safe(payment?.raw_status_detail || "—")}</dd></div><div><dt>Status do envio</dt><dd>${safe(shipment?.status || "—")}</dd></div><div><dt>ID Melhor Envio</dt><dd>${safe(shipment?.provider_order_id || "—")}</dd></div><div><dt>Observações</dt><dd>${safe(order.notes || "—")}</dd></div></dl></details></section>
      ${isShipping ? `<section class="admin-label-box"><div><strong>Etiqueta do Melhor Envio</strong><span>${shipment?.provider_order_id ? `Envio ${safe(shipment.provider_order_id)}` : "Ainda não gerada"}</span></div>${shipment?.label_url ? `<a href="${safe(shipment.label_url)}" target="_blank" rel="noopener">Abrir etiqueta</a>` : '<button type="button" disabled title="Cadastre remetente e documentação fiscal antes de gerar etiquetas">Gerar etiqueta Sandbox</button>'}</section>` : ""}`;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("visible"));
    qs("[data-close-order]", modal)?.focus();
  }

  function closeOrderModal() {
    const modal = qs("[data-admin-order-modal]");
    modal.classList.remove("visible");
    document.body.classList.remove("modal-open");
    window.setTimeout(() => { modal.hidden = true; }, 180);
  }

  function renderOrders() {
    const list = qs("[data-admin-orders]");
    const dashboard = qs("[data-dashboard-orders]");
    if (dashboard) dashboard.innerHTML = state.orders.length ? state.orders.slice(0, 5).map((order) => orderCard(order, true)).join("") : '<div class="account-empty"><strong>Nenhum pedido ainda.</strong><span>Os pedidos aparecerão aqui assim que o checkout estiver conectado.</span></div>';
    const filtered = state.orders.filter((order) => `${order.order_number} ${order.customer_name} ${order.customer_email} ${(order.order_items || []).map((item) => item.product_name).join(" ")}`.toLowerCase().includes(state.orderSearch));
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.orderPageSize));
    state.orderPage = Math.min(state.orderPage, totalPages);
    const start = (state.orderPage - 1) * state.orderPageSize;
    const visible = filtered.slice(start, start + state.orderPageSize);
    if (list) list.innerHTML = visible.length ? visible.map((order) => orderCard(order)).join("") : '<div class="account-empty"><strong>Nenhum pedido encontrado.</strong><span>Ajuste a busca ou aguarde novos pedidos.</span></div>';
    const pagination = qs("[data-order-pagination]");
    if (pagination) pagination.innerHTML = filtered.length > state.orderPageSize ? `
      <button type="button" data-page="${state.orderPage - 1}" ${state.orderPage === 1 ? "disabled" : ""}>← Anterior</button>
      <span>Página ${state.orderPage} de ${totalPages} · ${filtered.length} pedidos</span>
      <button type="button" data-page="${state.orderPage + 1}" ${state.orderPage === totalPages ? "disabled" : ""}>Próxima →</button>` : `<span>${filtered.length} ${filtered.length === 1 ? "pedido" : "pedidos"}</span>`;
    renderAttention();
  }

  function ordersNeedingAttention() {
    return state.orders.filter((order) => order.status === "paid" && !["completed", "cancelled"].includes(order.fulfillment_status));
  }

  function renderAttention() {
    const attention = ordersNeedingAttention();
    qs("[data-stat-attention]").textContent = attention.length;
    const list = qs("[data-attention-orders]");
    if (!list) return;
    list.innerHTML = attention.length ? attention.slice(0, 6).map((order) => `<button type="button" data-attention-order="${order.id}"><span><strong>${safe(order.order_number)}</strong><small>${safe(order.customer_name)} · ${dateTime(order.created_at)}</small></span><i>${safe(fulfillmentLabels[order.fulfillment_status] || order.fulfillment_status)}</i><b>${money(order.total_cents)}</b></button>`).join("") : '<div class="account-empty"><strong>Tudo em dia.</strong><span>Nenhum pedido pago está aguardando atualização.</span></div>';
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
    const paidOrders = state.orders.filter((order) => order.status === "paid");
    const revenue = paidOrders.reduce((total, order) => total + Number(order.total_cents || 0), 0);
    const ticket = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;
    qs("[data-stat-revenue]").textContent = money(revenue);
    qs("[data-stat-paid]").textContent = paidOrders.length;
    qs("[data-stat-ticket]").textContent = money(ticket);
    qs("[data-stat-attention]").textContent = ordersNeedingAttention().length;
    qs("[data-stat-orders-caption]").textContent = `de ${state.orders.length} pedidos`;
    renderAnalytics(paidOrders, revenue);
  }

  function renderAnalytics(paidOrders, revenue) {
    const chart = qs("[data-sales-chart]");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Array.from({ length:7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const next = new Date(date);
      next.setDate(date.getDate() + 1);
      const orders = paidOrders.filter((order) => {
          const paidAt = new Date(order.paid_at || order.created_at);
          return paidAt >= date && paidAt < next;
        });
      const value = orders.reduce((total, order) => total + Number(order.total_cents || 0), 0);
      return { date, value, count:orders.length };
    });
    const max = Math.max(...days.map((day) => day.value), 1);
    if (chart) chart.innerHTML = days.map((day) => {
      const height = day.value ? Math.max(12, Math.round((day.value / max) * 100)) : 4;
      const orderLabel = `${day.count} ${day.count === 1 ? "pedido" : "pedidos"}`;
      return `<div class="admin-bar-column admin-dashboard-bar" tabindex="0" aria-label="${safe(day.date.toLocaleDateString("pt-BR"))}, ${safe(money(day.value))}, ${safe(orderLabel)}"><strong>${safe(money(day.value))}<small>${safe(orderLabel)}</small></strong><i style="height:${height}%"></i><span>${safe(day.date.toLocaleDateString("pt-BR", { weekday:"short" }).replace(".", ""))}</span></div>`;
    }).join("");
    qs("[data-chart-total]").textContent = money(days.reduce((total, day) => total + day.value, 0));

    const statusConfig = [
      ["paid", "Pagos", "#19945b"],
      ["pending_payment", "Pendentes", "#f0bf19"],
      ["cancelled", "Cancelados", "#ef625d"],
      ["other", "Outros", "#728095"]
    ];
    const counts = statusConfig.map(([key, label, color]) => ({
      key, label, color,
      value:key === "other"
        ? state.orders.filter((order) => !["paid", "pending_payment", "cancelled"].includes(order.status)).length
        : state.orders.filter((order) => order.status === key).length
    }));
    const totalOrders = Math.max(state.orders.length, 1);
    let cursor = 0;
    const segments = counts.map((item) => {
      const start = cursor;
      cursor += (item.value / totalOrders) * 360;
      return `${item.color} ${start}deg ${cursor}deg`;
    });
    const donut = qs("[data-status-donut]");
    if (donut) donut.style.background = state.orders.length ? `conic-gradient(${segments.join(",")})` : "#e8e8e3";
    qs("[data-donut-total]").textContent = state.orders.length;
    qs("[data-status-legend]").innerHTML = counts.map((item) => `<li><i style="background:${item.color}"></i><span>${item.label}</span><strong>${item.value}</strong></li>`).join("");

    qs("[data-report-products]").textContent = money(paidOrders.reduce((total, order) => total + Number(order.subtotal_cents || 0), 0));
    qs("[data-report-shipping]").textContent = money(paidOrders.reduce((total, order) => total + Number(order.shipping_cents || 0), 0));
    qs("[data-report-items]").textContent = paidOrders.flatMap((order) => order.order_items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
    qs("[data-report-conversion]").textContent = state.orders.length ? `${Math.round((paidOrders.length / state.orders.length) * 100)}%` : "0%";

    const productCounts = new Map();
    paidOrders.flatMap((order) => order.order_items || []).forEach((item) => productCounts.set(item.product_name, (productCounts.get(item.product_name) || 0) + Number(item.quantity || 0)));
    const ranking = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    qs("[data-product-ranking]").innerHTML = ranking.length ? ranking.map(([name, quantity], index) => `<li><i>${index + 1}</i><span>${safe(name)}</span><strong>${quantity} un.</strong></li>`).join("") : "<li><span>Nenhuma venda aprovada ainda.</span></li>";

    const deliveryLabels = { shipping:"Envio para endereço", event_pickup:"Próximo evento" };
    const deliveryCounts = ["shipping", "event_pickup"].map((method) => ({ method, value:paidOrders.filter((order) => order.delivery_method === method).length }));
    const maxDelivery = Math.max(...deliveryCounts.map((item) => item.value), 1);
    qs("[data-delivery-breakdown]").innerHTML = deliveryCounts.map((item) => `<div><header><span>${deliveryLabels[item.method]}</span><strong>${item.value}</strong></header><i><b style="width:${Math.round((item.value / maxDelivery) * 100)}%"></b></i></div>`).join("");
    renderReport();
  }

  function reportOrders() {
    const [monthYear, monthNumber] = (state.reportMonth || "").split("-").map(Number);
    const selectedYear = state.reportMode === "month" ? monthYear : Number(state.reportYear);
    return state.orders.filter((order) => {
      const date = new Date(order.paid_at || order.created_at);
      return order.status === "paid" && date.getFullYear() === selectedYear && (state.reportMode === "year" || date.getMonth() + 1 === monthNumber);
    });
  }

  function renderReport() {
    const paidOrders = reportOrders();
    const [monthYear, monthNumber] = (state.reportMonth || "").split("-").map(Number);
    const selectedYear = state.reportMode === "month" ? monthYear : Number(state.reportYear);
    const createdInPeriod = state.orders.filter((order) => {
      const date = new Date(order.created_at);
      return date.getFullYear() === selectedYear && (state.reportMode === "year" || date.getMonth() + 1 === monthNumber);
    });
    qs("[data-report-products]").textContent = money(paidOrders.reduce((total, order) => total + Number(order.subtotal_cents || 0), 0));
    qs("[data-report-shipping]").textContent = money(paidOrders.reduce((total, order) => total + Number(order.shipping_cents || 0), 0));
    qs("[data-report-items]").textContent = paidOrders.flatMap((order) => order.order_items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
    qs("[data-report-conversion]").textContent = createdInPeriod.length ? `${Math.round((paidOrders.length / createdInPeriod.length) * 100)}%` : "0%";

    const productCounts = new Map();
    paidOrders.flatMap((order) => order.order_items || []).forEach((item) => productCounts.set(item.product_name, (productCounts.get(item.product_name) || 0) + Number(item.quantity || 0)));
    const ranking = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    qs("[data-product-ranking]").innerHTML = ranking.length ? ranking.map(([name, quantity], index) => `<li><i>${index + 1}</i><span>${safe(name)}</span><strong>${quantity} un.</strong></li>`).join("") : '<li class="admin-report-empty"><i>○</i><strong>Nada por aqui ainda</strong><span>Quando uma venda for aprovada, os produtos favoritos aparecem neste ranking.</span></li>';

    const deliveryLabels = { shipping:"Envio para endereço", event_pickup:"Próximo evento" };
    const deliveryCounts = ["shipping", "event_pickup"].map((method) => ({ method, value:paidOrders.filter((order) => order.delivery_method === method).length }));
    const maxDelivery = Math.max(...deliveryCounts.map((item) => item.value), 1);
    qs("[data-delivery-breakdown]").innerHTML = paidOrders.length ? deliveryCounts.map((item) => `<div><header><span>${deliveryLabels[item.method]}</span><strong>${item.value}</strong></header><i><b style="width:${Math.round((item.value / maxDelivery) * 100)}%"></b></i></div>`).join("") : '<div class="admin-report-empty"><i>↗</i><strong>Nenhuma entrega ainda</strong><span>As modalidades escolhidas pelos clientes vão aparecer aqui.</span></div>';

    const daysInMonth = new Date(selectedYear, monthNumber, 0).getDate();
    const bucketCount = state.reportMode === "year" ? 12 : Math.ceil(daysInMonth / 7);
    const buckets = Array.from({ length:bucketCount }, (_, index) => {
      const bucketOrders = paidOrders.filter((order) => {
        const date = new Date(order.paid_at || order.created_at);
        return state.reportMode === "year" ? date.getMonth() === index : Math.floor((date.getDate() - 1) / 7) === index;
      });
      const value = bucketOrders.reduce((total, order) => total + Number(order.total_cents || 0), 0);
      const startDay = index * 7 + 1;
      const endDay = Math.min(startDay + 6, daysInMonth);
      const label = state.reportMode === "year" ? new Date(selectedYear, index, 1).toLocaleDateString("pt-BR", { month:"short" }).replace(".", "") : `Semana ${index + 1}`;
      const detail = state.reportMode === "year" ? label : `${String(startDay).padStart(2, "0")}–${String(endDay).padStart(2, "0")}`;
      return { label, detail, value, count:bucketOrders.length };
    });
    const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
    const chart = qs("[data-report-chart]");
    chart.classList.toggle("empty", !paidOrders.length);
    chart.style.gridTemplateColumns = paidOrders.length ? `repeat(${bucketCount},minmax(62px,1fr))` : "1fr";
    chart.innerHTML = paidOrders.length
      ? buckets.map((bucket) => {
          const orderLabel = `${bucket.count} ${bucket.count === 1 ? "pedido" : "pedidos"}`;
          return `<div class="admin-bar-column admin-report-bar" tabindex="0" aria-label="${safe(bucket.label)}, ${safe(bucket.detail)}, ${safe(money(bucket.value))}, ${safe(orderLabel)}"><strong>${safe(money(bucket.value))}<small>${safe(orderLabel)}</small></strong><i style="height:${bucket.value ? Math.max(10, Math.round((bucket.value / max) * 100)) : 3}%"></i><span>${safe(bucket.label)}<small>${safe(bucket.detail)}</small></span></div>`;
        }).join("")
      : '<div class="admin-chart-empty"><i>↗</i><strong>Tudo zerado por aqui</strong><span>Nenhuma venda aprovada neste período. Que tal conferir o mês anterior?</span></div>';
    const periodTotal = paidOrders.reduce((total, order) => total + Number(order.total_cents || 0), 0);
    qs("[data-report-chart-total]").textContent = money(periodTotal);
    qs("[data-report-chart-title]").textContent = state.reportMode === "year" ? `Vendas de ${selectedYear}` : `Vendas do mês selecionado`;
    const periodLabel = qs("[data-report-period-label]");
    if (periodLabel) periodLabel.textContent = state.reportMode === "year"
      ? String(selectedYear)
      : new Date(selectedYear, monthNumber - 1, 1).toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
  }

  function exportReportCsv() {
    const orders = reportOrders();
    const rows = [["Pedido","Data","Cliente","E-mail","Entrega","Itens","Produtos","Frete","Total","Pagamento"]];
    orders.forEach((order) => rows.push([
      order.order_number,
      dateTime(order.paid_at || order.created_at),
      order.customer_name,
      order.customer_email,
      order.delivery_method === "shipping" ? "Envio" : "Próximo evento",
      (order.order_items || []).map((item) => `${item.quantity}x ${item.product_name}`).join(" | "),
      (Number(order.subtotal_cents || 0) / 100).toFixed(2).replace(".", ","),
      (Number(order.shipping_cents || 0) / 100).toFixed(2).replace(".", ","),
      (Number(order.total_cents || 0) / 100).toFixed(2).replace(".", ","),
      "Pago"
    ]));
    const csv = "\ufeff" + rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `only-cars-relatorio-${state.reportMode === "year" ? state.reportYear : state.reportMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadData() {
    feedback("[data-orders-feedback]", "Atualizando pedidos...");
    feedback("[data-inventory-feedback]", "Atualizando estoque...");
    const [products, orders] = await Promise.all([
      client.rest("products?select=id,slug,name,category,active,product_variants(id,sku,size,color,price_cents,stock_quantity,reserved_quantity,active)&order=name.asc&product_variants.order=size.asc,color.asc"),
      client.rest("orders?select=id,order_number,customer_name,customer_email,customer_phone,customer_tax_id,status,fulfillment_status,delivery_method,subtotal_cents,discount_cents,shipping_cents,total_cents,shipping_address,shipping_quote,notes,expires_at,paid_at,cancelled_at,created_at,updated_at,order_items(product_name,sku,size,color,quantity,unit_price_cents,line_total_cents,image_url,metadata,product_variants(image_urls)),payments(status,payment_method,installments,amount_cents,provider_payment_id,provider_preference_id,raw_status_detail,approved_at,created_at),shipments(provider_order_id,service_name,carrier_name,status,tracking_code,tracking_url,label_url,posted_at,delivered_at,updated_at),order_fiscal_documents(access_key,danfe_path,xml_path,issued_at,updated_at),order_exchange_requests(id,request_type,requested_solution,status,items,details,photo_paths,customer_message,admin_notes,return_tracking_code,return_tracking_url,replacement_tracking_code,replacement_tracking_url,created_at,updated_at)&order=created_at.desc")
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
    const now = new Date();
    state.reportMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    state.reportYear = now.getFullYear();
    qsa("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.adminTab)));
    qsa("[data-open-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.openTab)));
    qsa("[data-admin-refresh]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      await loadData().catch((error) => feedback("[data-orders-feedback]", error.message, "error"));
      button.disabled = false;
    }));
    qs("[data-order-search]")?.addEventListener("input", (event) => {
      state.orderSearch = event.target.value.trim().toLowerCase();
      state.orderPage = 1;
      renderOrders();
    });
    qs("[data-order-pagination]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.orderPage = Number(button.dataset.page);
      renderOrders();
      qs('[data-admin-panel="orders"]')?.scrollIntoView({ behavior:"smooth", block:"start" });
    });
    qs("[data-toggle-attention]")?.addEventListener("click", () => {
      const panel = qs("[data-attention-panel]");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) panel.scrollIntoView({ behavior:"smooth", block:"nearest" });
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
    qs("[data-admin-orders]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-order]");
      const card = button?.closest("[data-order-id]");
      if (!button || !card) return;
      const order = state.orders.find((item) => item.id === card.dataset.orderId);
      if (order) openOrderModal(order);
    });
    qs("[data-attention-orders]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-attention-order]");
      if (!button) return;
      const order = state.orders.find((item) => item.id === button.dataset.attentionOrder);
      if (order) openOrderModal(order);
    });
    qsa("[data-report-mode-button]").forEach((button) => button.addEventListener("click", () => {
      state.reportMode = button.dataset.reportModeButton;
      qsa("[data-report-mode-button]").forEach((item) => item.classList.toggle("active", item === button));
      renderReport();
    }));
    qsa("[data-report-period-step]").forEach((button) => button.addEventListener("click", () => {
      const direction = Number(button.dataset.reportPeriodStep);
      if (state.reportMode === "year") state.reportYear += direction;
      else {
        const [year, month] = state.reportMonth.split("-").map(Number);
        const target = new Date(year, month - 1 + direction, 1);
        state.reportMonth = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
      }
      renderReport();
    }));
    qs("[data-export-report]")?.addEventListener("click", exportReportCsv);
    const orderModal = qs("[data-admin-order-modal]");
    orderModal?.addEventListener("click", async (event) => {
      if (event.target === orderModal || event.target.closest("[data-close-order]")) return closeOrderModal();
      const step = event.target.closest("[data-fulfillment-step]");
      const dialog = qs("[data-admin-order-dialog]", orderModal);
      if (step) {
        dialog.dataset.fulfillmentStatus = step.dataset.fulfillmentStep;
        const buttons = qsa("[data-fulfillment-step]", dialog);
        const selectedIndex = buttons.indexOf(step);
        buttons.forEach((item, index) => item.classList.toggle("active", index <= selectedIndex));
        return;
      }
      const copyFiscalButton = event.target.closest("[data-copy-fiscal-data]");
      if (copyFiscalButton) {
        const order = state.orders.find((item) => item.id === dialog.dataset.orderId);
        if (!order) return;
        const items = (order.order_items || []).map((item) => `${item.quantity}x ${item.product_name} | SKU ${item.sku || "—"} | ${item.color || "sem cor"}${item.size ? ` | Tam. ${item.size}` : ""} | Unitário ${money(item.unit_price_cents)} | Total ${money(item.line_total_cents)}`).join("\n");
        const fiscalText = [
          `Pedido: ${order.order_number}`,
          `Cliente: ${order.customer_name}`,
          `CPF/CNPJ: ${order.customer_tax_id || "não informado"}`,
          `E-mail: ${order.customer_email}`,
          `Telefone: ${order.customer_phone}`,
          `Entrega: ${order.delivery_method === "shipping" ? "Envio para o endereço" : "Retirada no próximo evento"}`,
          order.delivery_method === "shipping" ? `Endereço: ${addressText(order.shipping_address).replaceAll("<br>", " | ")}` : "",
          "",
          "Produtos:", items,
          "",
          `Subtotal: ${money(order.subtotal_cents)}`,
          `Desconto: ${money(order.discount_cents)}`,
          `Frete: ${money(order.shipping_cents)}`,
          `Total: ${money(order.total_cents)}`
        ].filter((line) => line !== "").join("\n").replaceAll("&amp;", "&");
        await navigator.clipboard.writeText(fiscalText);
        const fiscalFeedback = qs("[data-fiscal-feedback]", dialog);
        fiscalFeedback.textContent = "Dados do pedido copiados.";
        return;
      }
      const fiscalDownloadButton = event.target.closest("[data-admin-fiscal-download]");
      if (fiscalDownloadButton) {
        fiscalDownloadButton.disabled = true;
        try {
          const url = await client.createPrivateDownload("fiscal-documents", fiscalDownloadButton.dataset.adminFiscalDownload, 120);
          const link = document.createElement("a");
          link.href = url;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch (error) {
          qs("[data-fiscal-feedback]", dialog).textContent = error.message;
        } finally {
          fiscalDownloadButton.disabled = false;
        }
        return;
      }
      const exchangePhotoButton = event.target.closest("[data-exchange-photo]");
      if (exchangePhotoButton) {
        exchangePhotoButton.disabled=true;
        try { const url=await client.createPrivateDownload("exchange-evidence",exchangePhotoButton.dataset.exchangePhoto,120); window.open(url,"_blank","noopener"); }
        catch(error){ qs("[data-exchange-admin-feedback]",dialog).textContent=error.message; }
        finally { exchangePhotoButton.disabled=false; }
        return;
      }
      const saveExchangeButton = event.target.closest("[data-save-exchange]");
      if (saveExchangeButton) {
        const section=saveExchangeButton.closest("[data-admin-exchange-id]");
        const exchangeFeedback=qs("[data-exchange-admin-feedback]",section);
        saveExchangeButton.disabled=true; saveExchangeButton.textContent="Salvando...";
        try {
          await client.rest("rpc/admin_update_exchange_request",{method:"POST",body:{p_request_id:section.dataset.adminExchangeId,p_status:qs("[data-exchange-status]",section).value,p_customer_message:qs("[data-exchange-customer-message]",section).value,p_admin_notes:qs("[data-exchange-admin-notes]",section).value,p_return_tracking_code:qs("[data-exchange-return-code]",section).value,p_return_tracking_url:qs("[data-exchange-return-url]",section).value,p_replacement_tracking_code:qs("[data-exchange-replacement-code]",section).value,p_replacement_tracking_url:qs("[data-exchange-replacement-url]",section).value}});
          exchangeFeedback.textContent="Solicitação atualizada para o cliente."; await loadData();
          const refreshed=state.orders.find((item)=>item.id===dialog.dataset.orderId); if(refreshed) openOrderModal(refreshed);
        } catch(error){ exchangeFeedback.textContent=error.message; saveExchangeButton.disabled=false; saveExchangeButton.textContent="Atualizar solicitação"; }
        return;
      }
      const saveFiscalButton = event.target.closest("[data-save-fiscal]");
      if (saveFiscalButton) {
        const order = state.orders.find((item) => item.id === dialog.dataset.orderId);
        const existing = Array.isArray(order?.order_fiscal_documents) ? order.order_fiscal_documents[0] : order?.order_fiscal_documents;
        const accessKey = qs("[data-fiscal-access-key]", dialog)?.value.replace(/\D/g, "") || "";
        const issuedAt = qs("[data-fiscal-issued-at]", dialog)?.value;
        const danfe = qs("[data-fiscal-danfe]", dialog)?.files?.[0];
        const xml = qs("[data-fiscal-xml]", dialog)?.files?.[0];
        const fiscalFeedback = qs("[data-fiscal-feedback]", dialog);
        if (accessKey.length !== 44) { fiscalFeedback.textContent = "Informe os 44 números da chave de acesso."; return; }
        if (!issuedAt) { fiscalFeedback.textContent = "Informe a data e a hora da emissão."; return; }
        if (!existing && (!danfe || !xml)) { fiscalFeedback.textContent = "Anexe o DANFE em PDF e o XML autorizado."; return; }
        if (danfe && (danfe.type !== "application/pdf" || danfe.size > 5242880)) { fiscalFeedback.textContent = "O DANFE deve ser um PDF de até 5 MB."; return; }
        if (xml && (!/\.xml$/i.test(xml.name) || xml.size > 5242880)) { fiscalFeedback.textContent = "O XML deve ter extensão .xml e até 5 MB."; return; }
        saveFiscalButton.disabled = true;
        saveFiscalButton.textContent = "Enviando...";
        try {
          const danfePath = `${order.id}/danfe.pdf`;
          const xmlPath = `${order.id}/nfe.xml`;
          if (danfe) await client.uploadPrivateFile("fiscal-documents", danfePath, danfe);
          if (xml) await client.uploadPrivateFile("fiscal-documents", xmlPath, xml);
          await client.rest("rpc/admin_save_order_fiscal_document", { method:"POST", body:{
            target_order_id:order.id,
            new_access_key:accessKey,
            new_danfe_path:danfePath,
            new_xml_path:xmlPath,
            new_issued_at:new Date(issuedAt).toISOString()
          }});
          fiscalFeedback.textContent = "NF-e salva e liberada para o cliente.";
          feedback("[data-orders-feedback]", `NF-e do pedido ${order.order_number} atualizada.`, "success");
          await loadData();
          const refreshed = state.orders.find((item) => item.id === order.id);
          if (refreshed) openOrderModal(refreshed);
        } catch (error) {
          fiscalFeedback.textContent = error.message;
        } finally {
          saveFiscalButton.disabled = false;
          saveFiscalButton.textContent = "Salvar NF-e";
        }
        return;
      }
      const button = event.target.closest("[data-save-order]");
      if (!button) return;
      button.disabled = true;
      button.textContent = "Salvando...";
      const modalFeedback = qs("[data-modal-feedback]", dialog);
      try {
        await client.rest("rpc/admin_update_order_fulfillment", { method: "POST", body: {
          target_order_id:dialog.dataset.orderId,
          new_fulfillment_status:dialog.dataset.fulfillmentStatus,
          new_tracking_code:qs("[data-tracking-code]", dialog)?.value || null,
          new_tracking_url:qs("[data-tracking-url]", dialog)?.value || null
        } });
        await loadData();
        modalFeedback.textContent = "Acompanhamento atualizado para o cliente.";
        feedback("[data-orders-feedback]", "Status do pedido atualizado.", "success");
        window.setTimeout(closeOrderModal, 650);
      } catch (error) {
        modalFeedback.textContent = error.message;
        feedback("[data-orders-feedback]", error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = "Salvar acompanhamento";
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !orderModal?.hidden) closeOrderModal();
    });
  }

  async function initialize() {
    if (!qs("[data-admin-page]")) return;
    const loading = qs("[data-admin-loading]");
    const content = qs("[data-admin-content]");
    let user;
    let profile;

    try {
      user = await client.getUser();
      if (!user) return location.replace("index.html");
      const profiles = await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role,display_name`);
      profile = profiles?.[0];
      if (profile?.role !== "admin") return location.replace("index.html");
    } catch (_) {
      return location.replace("index.html");
    }

    qs("[data-admin-name]").textContent = profile.display_name || "Administrador";
    qs("[data-admin-email]").textContent = user.email;
    loading.hidden = true;
    content.hidden = false;
    document.body.classList.remove("admin-access-pending");
    bindInteractions();

    try {
      await loadData();
    } catch (error) {
      feedback("[data-orders-feedback]", error.message || "Não foi possível carregar os pedidos.", "error");
      feedback("[data-inventory-feedback]", error.message || "Não foi possível carregar o estoque.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
