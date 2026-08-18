(() => {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
  const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }) : "—";
  const money = (cents) => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(cents || 0) / 100);

  const exchangeSteps = [
    ["received", "Recebida"], ["under_review", "Em análise"],
    ["awaiting_return", "Aguardando envio"], ["return_in_transit", "Em devolução"],
    ["received_return", "Produto recebido"], ["exchange_sent", "Troca enviada"],
    ["completed", "Concluída"]
  ];
  const exchangeEndings = [["refunded", "Reembolsada"], ["rejected", "Não aprovada"], ["cancelled", "Cancelada"]];
  const messageTemplates = {
    under_review:"Recebemos sua solicitação e ela está em análise pela equipe Only.",
    awaiting_return:"Sua solicitação foi aprovada. Envie o produto conforme as orientações informadas.",
    received_return:"Recebemos o produto e estamos preparando a conclusão da sua solicitação.",
    exchange_sent:"Sua troca foi enviada. Acompanhe pelo código de rastreio informado abaixo.",
    refunded:"O reembolso foi realizado. O prazo para aparecer depende do meio de pagamento.",
    completed:"Solicitação concluída. Se precisar de ajuda, fale com a equipe Only.",
    rejected:"Não foi possível aprovar a solicitação. Consulte a mensagem abaixo para entender o motivo."
  };

  function enhanceExchange(section) {
    if (!section || section.dataset.enhanced === "true") return;
    section.dataset.enhanced = "true";
    const select = qs("[data-exchange-status]", section);
    const customerMessage = qs("[data-exchange-customer-message]", section);
    if (!select || !customerMessage) return;

    const quick = document.createElement("div");
    quick.className = "admin-exchange-quick";
    const selectedIndex = exchangeSteps.findIndex(([value]) => value === select.value);
    quick.innerHTML = `<div class="admin-exchange-quick-heading"><span>Atualização rápida</span><small>Arraste para o lado. Ao avançar ou voltar, as demais etapas são ajustadas automaticamente.</small></div><div class="admin-exchange-step-scroll"><div class="admin-exchange-step-buttons">${exchangeSteps.map(([value,label], index) => `<button type="button" data-exchange-quick-status="${value}" class="${selectedIndex >= 0 && index <= selectedIndex ? "done" : ""} ${index === selectedIndex ? "active" : ""}"><i>${index + 1}</i><span>${label}</span></button>`).join("")}</div></div><div class="admin-exchange-ending-buttons"><span>Encerramentos alternativos</span><div>${exchangeEndings.map(([value,label]) => `<button type="button" data-exchange-quick-status="${value}" class="${select.value === value ? "active" : ""}">${label}</button>`).join("")}</div></div>`;
    const fields = qs(".admin-exchange-fields", section);
    fields.before(quick);
    select.closest("label").classList.add("admin-exchange-native-status");

    const templates = document.createElement("div");
    templates.className = "admin-exchange-templates";
    templates.innerHTML = `<span>Mensagens rápidas</span><div><button type="button" data-exchange-template="under_review">Em análise</button><button type="button" data-exchange-template="awaiting_return">Solicitar envio</button><button type="button" data-exchange-template="exchange_sent">Troca enviada</button><button type="button" data-exchange-template="completed">Concluir</button></div>`;
    customerMessage.closest("label").before(templates);

    quick.addEventListener("click", (event) => {
      const button = event.target.closest("[data-exchange-quick-status]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      select.value = button.dataset.exchangeQuickStatus;
      const nextIndex = exchangeSteps.findIndex(([value]) => value === select.value);
      qsa(".admin-exchange-step-buttons [data-exchange-quick-status]", quick).forEach((item, index) => {
        item.classList.toggle("done", nextIndex >= 0 && index <= nextIndex);
        item.classList.toggle("active", index === nextIndex);
      });
      qsa(".admin-exchange-ending-buttons [data-exchange-quick-status]", quick).forEach((item) => item.classList.toggle("active", item === button));
      if (nextIndex >= 0) button.scrollIntoView({ behavior:"smooth", block:"nearest", inline:"center" });
      if (!customerMessage.value.trim() && messageTemplates[select.value]) customerMessage.value = messageTemplates[select.value];
    });
    templates.addEventListener("click", (event) => {
      const button = event.target.closest("[data-exchange-template]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      customerMessage.value = messageTemplates[button.dataset.exchangeTemplate] || "";
      customerMessage.dispatchEvent(new Event("input", { bubbles:true }));
    });
  }

  function setupExchangeEnhancer() {
    const dialog = qs("[data-admin-order-dialog]");
    if (!dialog) return;
    const observer = new MutationObserver(() => enhanceExchange(qs("[data-admin-exchange-id]", dialog)));
    observer.observe(dialog, { childList:true, subtree:true });
    enhanceExchange(qs("[data-admin-exchange-id]", dialog));
  }

  let stream = null;
  let detector = null;
  let scanFrame = 0;
  let scanning = false;
  let scanProcessing = false;
  let lastToken = "";
  let currentTicket = null;
  let selectedEventId = null;
  let confirmationPhotos = [];
  let photoFilter = "pending";
  const fallbackCanvas = document.createElement("canvas");
  const fallbackContext = fallbackCanvas.getContext("2d", { willReadFrequently:true });

  function normalizeQrValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return url.searchParams.get("token") || url.searchParams.get("ticket") || raw;
    } catch (_) { return raw; }
  }

  function setScannerFeedback(message, type = "") {
    const target = qs("[data-scanner-feedback]");
    if (!target) return;
    target.textContent = message;
    target.dataset.type = type;
  }

  function renderTicket(ticket) {
    if (selectedEventId && ticket.event_id !== selectedEventId) throw new Error("Este ingresso pertence a outro evento. Abra o evento correto antes de validar.");
    currentTicket = ticket;
    const result = qs("[data-ticket-result]");
    const statusLabels = { reserved:"Reservado", active:"Ativo", checked_in:"Dentro do evento", cancelled:"Cancelado", refunded:"Reembolsado", blocked:"Bloqueado" };
    const allowed = ["reserved", "active", "checked_in"].includes(ticket.status);
    const isInside = ticket.status === "checked_in" && ticket.last_entry_at && (!ticket.last_exit_at || new Date(ticket.last_entry_at) > new Date(ticket.last_exit_at));
    const hasExited = ticket.last_entry_at && ticket.last_exit_at && new Date(ticket.last_exit_at) >= new Date(ticket.last_entry_at);
    const displayStatus = hasExited ? "Fora do evento" : (statusLabels[ticket.status] || ticket.status);
    const entryAction = hasExited ? "reentry" : "entry";
    const entryLabel = hasExited ? "Confirmar reentrada" : "Confirmar entrada";
    result.innerHTML = `<article class="admin-ticket-detail" data-status="${escapeHtml(ticket.status)}">
      <header><div><span>Ingresso encontrado</span><strong>${escapeHtml(ticket.ticket_code)}</strong></div><b>${escapeHtml(displayStatus)}</b></header>
      <div class="admin-ticket-driver"><i>${escapeHtml(String(ticket.driver_name || "O").charAt(0).toUpperCase())}</i><div><span>Motorista</span><strong>${escapeHtml(ticket.driver_name)}</strong><small>${escapeHtml(ticket.driver_phone || "Telefone não informado")}</small></div></div>
      <dl><div><dt>Veículo</dt><dd>${escapeHtml([ticket.vehicle_make,ticket.vehicle_model,ticket.vehicle_year].filter(Boolean).join(" "))}</dd></div><div><dt>Placa</dt><dd class="plate">${escapeHtml(ticket.vehicle_plate)}</dd></div><div><dt>Evento</dt><dd>${escapeHtml(ticket.event_name)}</dd></div><div><dt>Última entrada</dt><dd>${dateTime(ticket.last_entry_at)}</dd></div><div><dt>Última saída</dt><dd>${dateTime(ticket.last_exit_at)}</dd></div></dl>
      <div class="admin-ticket-checkin-actions">
        <button class="primary" type="button" data-ticket-action="${entryAction}" ${allowed && !isInside ? "" : "disabled"}>${entryLabel}</button>
        <button type="button" data-ticket-action="exit" ${isInside ? "" : "disabled"}>Registrar saída</button>
      </div><p data-ticket-action-feedback></p>
    </article>`;
  }

  async function inspectToken(value) {
    const token = normalizeQrValue(value);
    if (!token || token.length < 16) throw new Error("QR Code incompleto ou inválido.");
    lastToken = token;
    setScannerFeedback("Consultando ingresso...", "loading");
    const ticket = await client.rest("rpc/admin_inspect_event_ticket", { method:"POST", body:{ p_qr_token:token } });
    renderTicket(ticket);
    setScannerFeedback("Ingresso localizado. Confira os dados antes de confirmar.", "success");
    stopScanner();
  }

  function selectSearchResult(ticket) {
    if (!ticket?.qr_token) throw new Error("Este ingresso não possui uma credencial válida para movimentação.");
    lastToken = ticket.qr_token;
    renderTicket(ticket);
    setScannerFeedback("Ingresso selecionado. Confira os dados antes de confirmar.", "success");
    stopScanner();
  }

  function renderSearchResults(tickets, query) {
    const result = qs("[data-ticket-result]");
    if (tickets.length === 1) {
      selectSearchResult(tickets[0]);
      return;
    }
    currentTicket = null;
    lastToken = "";
    result.innerHTML = `<div class="admin-ticket-search-results"><header><span>Resultados para</span><strong>“${escapeHtml(query)}”</strong><small>${tickets.length} ingressos encontrados. Selecione após conferir nome, placa e veículo.</small></header><div>${tickets.map((ticket, index) => `<button type="button" data-ticket-search-index="${index}"><i>${escapeHtml(String(ticket.driver_name || "O").charAt(0).toUpperCase())}</i><span><strong>${escapeHtml(ticket.driver_name)}</strong><small>${escapeHtml([ticket.ticket_code, String(ticket.vehicle_plate || "").toUpperCase(), ticket.vehicle_make, ticket.vehicle_model].filter(Boolean).join(" · "))}</small></span><b>Selecionar →</b></button>`).join("")}</div></div>`;
    result.onclick = (event) => {
      const button = event.target.closest("[data-ticket-search-index]");
      if (!button) return;
      selectSearchResult(tickets[Number(button.dataset.ticketSearchIndex)]);
    };
    setScannerFeedback("Mais de um ingresso foi localizado. Selecione o correto ao lado.", "warning");
  }

  async function searchTickets(value) {
    const query = String(value || "").trim();
    if (!selectedEventId) throw new Error("Selecione o evento antes de pesquisar.");
    if (query.length < 2) throw new Error("Digite ao menos 2 caracteres para pesquisar.");
    setScannerFeedback("Pesquisando ingressos...", "loading");
    const tickets = await client.rest("rpc/admin_search_event_tickets", { method:"POST", body:{ p_event_id:selectedEventId, p_query:query } }) || [];
    if (!tickets.length) throw new Error("Nenhum ingresso encontrado com esses dados.");
    renderSearchResults(tickets, query);
  }

  async function scanLoop() {
    if (!scanning || !qs("[data-scanner-video]")) return;
    const video = qs("[data-scanner-video]");
    if (video.readyState >= 2) {
      try {
        let rawValue = "";
        if (detector) {
          try {
            const codes = await detector.detect(video);
            rawValue = codes[0]?.rawValue || "";
          } catch (_) {
            detector = null;
          }
        }
        if (!rawValue && window.jsQR && fallbackContext && video.videoWidth && video.videoHeight) {
          const maxWidth = 1280;
          const scale = Math.min(1, maxWidth / video.videoWidth);
          fallbackCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          fallbackCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          fallbackContext.drawImage(video, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
          const image = fallbackContext.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height);
          rawValue = window.jsQR(image.data, image.width, image.height, { inversionAttempts:"attemptBoth" })?.data || "";
        }
        if (rawValue && !scanProcessing) {
          scanProcessing = true;
          try {
            await inspectToken(rawValue);
          } catch (error) {
            stopScanner();
            setScannerFeedback(error?.message || "Não foi possível consultar este ingresso.", "error");
          } finally {
            scanProcessing = false;
          }
          return;
        }
      } catch (error) {
        if (scanning && !scanProcessing) setScannerFeedback("Mantenha o QR centralizado e com boa iluminação.");
      }
    }
    scanFrame = requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerFeedback("Este navegador não permite acesso à câmera. Tente abrir no Chrome ou Safari atualizado.", "warning");
      return;
    }
    try {
      detector = null;
      if ("BarcodeDetector" in window) {
        try { detector = new BarcodeDetector({ formats:["qr_code"] }); } catch (_) { detector = null; }
      }
      if (!detector && !window.jsQR) throw new Error("Leitor de QR indisponível.");
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1920 }, height:{ ideal:1080 } }, audio:false });
      const video = qs("[data-scanner-video]");
      video.srcObject = stream;
      await video.play();
      const track = stream.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.() || {};
      if (capabilities.focusMode?.includes?.("continuous")) {
        await track.applyConstraints({ advanced:[{ focusMode:"continuous" }] }).catch(() => null);
      }
      scanning = true;
      qs("[data-scanner-viewport]").classList.add("active");
      qs("[data-scanner-start]").disabled = true;
      qs("[data-scanner-stop]").disabled = false;
      setScannerFeedback("Câmera ativa. Aponte para o QR Code.", "success");
      scanLoop();
    } catch (error) {
      setScannerFeedback("Não foi possível acessar a câmera. Autorize o uso ou utilize a leitura manual.", "error");
    }
  }

  function stopScanner() {
    scanning = false;
    scanProcessing = false;
    cancelAnimationFrame(scanFrame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = qs("[data-scanner-video]");
    if (video) video.srcObject = null;
    qs("[data-scanner-viewport]")?.classList.remove("active");
    if (qs("[data-scanner-start]")) qs("[data-scanner-start]").disabled = false;
    if (qs("[data-scanner-stop]")) qs("[data-scanner-stop]").disabled = true;
  }

  let ticketCoupons = [];
  const localDateTime = (value) => value ? new Date(value).toISOString().slice(0,16) : "";

  function openCouponForm(coupon = null) {
    const form = qs("[data-ticket-coupon-form]");
    form.hidden = false;
    form.reset();
    form.elements.coupon_id.value = coupon?.id || "";
    form.elements.code.value = coupon?.code || "";
    form.elements.description.value = coupon?.description || "";
    form.elements.discount_type.value = coupon?.discount_type || "percent";
    form.elements.discount_value.value = coupon ? (coupon.discount_type === "fixed" ? Number(coupon.discount_value) / 100 : coupon.discount_value) : 10;
    form.elements.max_redemptions.value = coupon?.max_redemptions || "";
    form.elements.max_redemptions_per_user.value = coupon?.max_redemptions_per_user || 1;
    form.elements.starts_at.value = localDateTime(coupon?.starts_at);
    form.elements.ends_at.value = localDateTime(coupon?.ends_at);
    form.elements.active.checked = coupon?.active ?? true;
    form.scrollIntoView({ behavior:"smooth", block:"center" });
  }

  async function loadTicketCoupons() {
    if (!selectedEventId || !qs("[data-ticket-coupons]")) return;
    const root = qs("[data-ticket-coupons]");
    try {
      ticketCoupons = await client.rest("rpc/admin_ticket_purchase_coupons", { method:"POST", body:{ p_event_id:selectedEventId } }) || [];
      root.innerHTML = ticketCoupons.length ? `<div class="admin-coupon-list">${ticketCoupons.map((coupon) => `<article class="admin-coupon-card" data-coupon-id="${escapeHtml(coupon.id)}" data-active="${coupon.active}"><div><span>Código</span><strong>${escapeHtml(coupon.code)}</strong><small>${escapeHtml(coupon.description || (coupon.active ? "Ativo" : "Inativo"))}</small></div><div><span>Desconto</span><strong>${coupon.discount_type === "percent" ? `${coupon.discount_value}%` : money(coupon.discount_value)}</strong><small>${coupon.max_redemptions ? `${Number(coupon.paid_uses || 0)}/${coupon.max_redemptions} usos pagos` : `${Number(coupon.paid_uses || 0)} usos pagos`}</small></div><div><span>Receita gerada</span><strong>${money(coupon.revenue_cents)}</strong><small>${money(coupon.discount_granted_cents)} concedidos</small></div><div><span>Validade</span><strong>${coupon.ends_at ? dateTime(coupon.ends_at) : "Sem vencimento"}</strong><small>${Number(coupon.reserved_uses || 0)} reservados agora</small></div><div class="admin-coupon-card-actions"><button type="button" data-edit-ticket-coupon>Editar</button><button type="button" data-toggle-ticket-coupon="${coupon.active ? "false" : "true"}">${coupon.active ? "Desativar" : "Ativar"}</button></div></article>`).join("")}</div>` : '<div class="admin-ticket-activity-empty">Nenhum cupom criado para este evento.</div>';
      qs("[data-ticket-coupon-admin-feedback]").textContent = "";
    } catch (loadError) { root.innerHTML = ""; qs("[data-ticket-coupon-admin-feedback]").textContent = loadError.message || "Não foi possível carregar os cupons."; }
  }

  async function loadTicketStats() {
    if (!selectedEventId) return;
    try {
      const data = await client.rest("rpc/admin_event_gate_summary_for_event", { method:"POST", body:{ p_event_id:selectedEventId } });
      qs("[data-ticket-stat-active]").textContent = data.active_tickets || 0;
      qs("[data-ticket-stat-inside]").textContent = data.inside_event || 0;
      qs("[data-ticket-stat-today]").textContent = data.movements_today || 0;
      const sales = await client.rest("rpc/admin_ticket_sales_summary", { method:"POST", body:{ p_event_id:selectedEventId } });
      qs("[data-ticket-stat-sold]").textContent = sales.sold_tickets || 0;
      qs("[data-ticket-stat-revenue]").textContent = money(sales.net_revenue_cents);
      qs("[data-ticket-stat-discount]").textContent = `${money(sales.discount_cents)} em descontos`;
      const activity = qs("[data-ticket-activity]");
      activity.innerHTML = data.recent_activity?.length ? data.recent_activity.map((item) => `<article><i data-action="${escapeHtml(item.action)}"></i><div><strong>${escapeHtml(item.ticket_code)} · ${escapeHtml(item.driver_name)}</strong><span>${escapeHtml(item.vehicle_plate)} · ${escapeHtml(item.action_label)}</span></div><time>${dateTime(item.created_at)}</time></article>`).join("") : '<div class="admin-ticket-activity-empty">Nenhuma movimentação registrada ainda.</div>';
    } catch (error) {
      setScannerFeedback("Execute a migração do leitor de ingressos para ativar esta área.", "warning");
    }
  }

  async function loadRefundRequests() {
    const root = qs("[data-refund-requests]");
    const feedback = qs("[data-refund-feedback]");
    if (!root || !selectedEventId) return;
    feedback.textContent = "Carregando solicitações...";
    try {
      const requests = await client.rest("rpc/admin_ticket_refund_requests", { method:"POST", body:{ p_event_id:selectedEventId } }) || [];
      root.innerHTML = requests.length ? requests.map((item) => `<article class="admin-refund-card" data-refund-id="${escapeHtml(item.id)}"><header><div><strong>${escapeHtml(item.ticket_code)} · ${escapeHtml(item.driver_name)}</strong><span>${escapeHtml(item.vehicle_plate)} · ${escapeHtml(item.customer_email)}</span></div><b data-status="${escapeHtml(item.status)}">${escapeHtml({requested:"Nova",under_review:"Em análise",approved:"Aprovada",rejected:"Recusada",refunded:"Reembolsada",cancelled:"Cancelada"}[item.status] || item.status)}</b></header><div><span>Motivo</span><strong>${escapeHtml(item.reason)}</strong>${item.details ? `<p>${escapeHtml(item.details)}</p>` : ""}<small>${dateTime(item.created_at)} · ${(Number(item.total_cents || 0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</small></div><footer><textarea data-refund-notes rows="2" maxlength="800" placeholder="Observação para o cliente">${escapeHtml(item.admin_notes || "")}</textarea><div><button type="button" data-refund-status="under_review">Marcar em análise</button><button class="primary" type="button" data-refund-status="approved">Aprovar solicitação</button><button type="button" data-refund-status="rejected">Recusar</button></div></footer></article>`).join("") : '<div class="admin-ticket-activity-empty">Nenhuma solicitação de cancelamento ou reembolso.</div>';
      feedback.textContent = "";
    } catch (error) { root.innerHTML = ""; feedback.textContent = error.message || "Não foi possível carregar as solicitações."; }
  }

  const normalizeInstagram = (value) => String(value || "").trim().replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, "");

  async function renderConfirmationPhotos() {
    const root = qs("[data-confirmation-photos]");
    const feedback = qs("[data-photo-feedback]");
    if (!root) return;
    const visible = confirmationPhotos.filter((item) => photoFilter === "posted" ? item.posted : !item.posted);
    qs("[data-photo-pending-count]").textContent = confirmationPhotos.filter((item) => !item.posted).length;
    qs("[data-photo-posted-count]").textContent = confirmationPhotos.filter((item) => item.posted).length;
    if (!visible.length) {
      root.innerHTML = `<div class="admin-photo-empty"><strong>${photoFilter === "posted" ? "Nenhuma foto postada ainda" : "Tudo em dia por aqui"}</strong><span>${photoFilter === "posted" ? "As fotos marcadas como postadas aparecerão nesta lista." : "Novas fotos de ingressos pagos aparecerão automaticamente."}</span></div>`;
      if (feedback) feedback.textContent = "";
      return;
    }
    root.innerHTML = visible.map((item) => {
      const handle = normalizeInstagram(item.instagram_handle);
      return `<article class="admin-photo-card" data-photo-id="${escapeHtml(item.id)}">
        <button class="admin-photo-preview" type="button" data-open-confirmation-photo="${escapeHtml(item.id)}"><span>Carregando foto...</span></button>
        <div class="admin-photo-card-body">
          <div class="admin-photo-project"><span>Projeto</span>${handle ? `<a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${escapeHtml(handle)}</a>` : "<strong>@ não informado</strong>"}</div>
          <h4>${escapeHtml([item.vehicle_make, item.vehicle_model].filter(Boolean).join(" ") || "Veículo Expo")}</h4>
          <p>${escapeHtml(item.driver_name)} · <b>${escapeHtml(item.vehicle_plate)}</b></p>
          <small>Enviada em ${dateTime(item.created_at)}</small>
          <div class="admin-photo-actions">
            <button class="primary" type="button" data-set-photo-posted="${escapeHtml(item.id)}" data-posted="${item.posted ? "false" : "true"}">${item.posted ? "Voltar para aguardando" : "Marcar como postado"}</button>
            <button type="button" data-download-confirmation-photo="${escapeHtml(item.id)}">Baixar foto</button>
          </div>
          ${item.posted ? `<em>Postado em ${dateTime(item.posted_at)}</em>` : ""}
        </div>
      </article>`;
    }).join("");
    await Promise.all(visible.map(async (item) => {
      const preview = qs(`[data-photo-id="${CSS.escape(item.id)}"] [data-open-confirmation-photo]`, root);
      try {
        item.signed_url = item.signed_url || await client.signedUrl("ticket-confirmations", item.storage_path, 3600);
        if (preview) preview.innerHTML = `<img src="${escapeHtml(item.signed_url)}" alt="${escapeHtml(`Foto do projeto ${item.vehicle_make || ""} ${item.vehicle_model || ""}`.trim())}">`;
      } catch (_) {
        if (preview) preview.innerHTML = "<span>Não foi possível carregar a foto</span>";
      }
    }));
    if (feedback) feedback.textContent = "";
  }

  async function loadConfirmationPhotos() {
    if (!selectedEventId) return;
    const feedback = qs("[data-photo-feedback]");
    if (feedback) feedback.textContent = "Carregando fotos de confirmação...";
    try {
      confirmationPhotos = await client.rest("rpc/admin_event_confirmation_photos", { method:"POST", body:{ p_event_id:selectedEventId } }) || [];
      await renderConfirmationPhotos();
    } catch (error) {
      confirmationPhotos = [];
      if (feedback) feedback.textContent = error.message || "Não foi possível carregar as fotos.";
    }
  }

  async function loadGateEvents() {
    const root = qs("[data-admin-event-selector]");
    const gate = qs("[data-admin-event-gate]");
    const panel = qs("[data-admin-panel='tickets']");
    if (!root || !gate) return;
    try {
      const events = await client.rest("rpc/admin_event_gate_events", { method:"POST", body:{} });
      root.innerHTML = events?.length ? events.map((event) => `<button type="button" data-gate-event="${escapeHtml(event.id)}" data-gate-event-name="${escapeHtml(event.name)}" data-gate-event-date="${escapeHtml(new Date(event.starts_at).toLocaleDateString("pt-BR"))}"><span>${new Date(event.starts_at).toLocaleDateString("pt-BR")}</span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.venue_name || "Local a confirmar")} · ${Number(event.ticket_count || 0)} ${Number(event.ticket_count || 0) === 1 ? "ingresso" : "ingressos"}</small><i>→</i></button>`).join("") : '<div class="admin-ticket-activity-empty">Nenhum evento cadastrado.</div>';
      root.onclick = async (clickEvent) => {
        const button = clickEvent.target.closest("[data-gate-event]");
        if (!button) return;
        selectedEventId = button.dataset.gateEvent;
        qsa("[data-gate-event]", root).forEach((item) => item.classList.toggle("active", item === button));
        panel?.classList.add("is-event-open");
        qs("[data-admin-events-title]").textContent = button.dataset.gateEventName || "Operação do evento";
        qs("[data-admin-events-description]").textContent = `${button.dataset.gateEventDate || ""} · Leitor, indicadores e movimentações da portaria.`;
        qs("[data-admin-event-back]").hidden = false;
        gate.hidden = false;
        stopScanner();
        qs("[data-ticket-result]").innerHTML = '<div class="admin-ticket-empty"><i>⌁</i><strong>Nenhum ingresso lido</strong><span>Os dados do motorista e do veículo aparecerão aqui antes da confirmação.</span></div>';
        setScannerFeedback("Evento selecionado. Inicie a câmera ou utilize a leitura manual.", "success");
        await Promise.all([loadTicketStats(), loadTicketCoupons(), loadConfirmationPhotos(), loadRefundRequests()]);
        gate.scrollIntoView({ behavior:"smooth", block:"start" });
      };
    } catch (error) {
      root.innerHTML = `<div class="admin-ticket-activity-empty">${escapeHtml(error.message || "Não foi possível carregar os eventos.")}</div>`;
    }
  }

  function setupScanner() {
    if (!qs("[data-admin-panel='tickets']")) return;
    qs("[data-scanner-start]").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); startScanner(); });
    qs("[data-scanner-stop]").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); stopScanner(); });
    qs("[data-scanner-search]").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); searchTickets(qs("[data-scanner-input]").value).catch((error) => setScannerFeedback(error.message, "error")); });
    qs("[data-scanner-input]").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); qs("[data-scanner-search]").click(); } });
    qs("[data-ticket-refresh]").addEventListener("click", () => selectedEventId ? Promise.all([loadTicketStats(), loadTicketCoupons(), loadConfirmationPhotos(), loadRefundRequests()]) : loadGateEvents());
    qs("[data-new-ticket-coupon]")?.addEventListener("click", () => openCouponForm());
    qs("[data-cancel-ticket-coupon]")?.addEventListener("click", () => { qs("[data-ticket-coupon-form]").hidden = true; });
    qs("[data-ticket-coupon-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget, data = new FormData(form), feedback = qs("[data-ticket-coupon-admin-feedback]");
      const type = String(data.get("discount_type"));
      const rawValue = Number(data.get("discount_value"));
      feedback.textContent = "Salvando cupom...";
      try {
        await client.rest("rpc/admin_save_ticket_purchase_coupon", { method:"POST", body:{ p_event_id:selectedEventId, p_id:data.get("coupon_id") || null, p_code:String(data.get("code") || "").trim().toUpperCase(), p_description:String(data.get("description") || "").trim() || null, p_discount_type:type, p_discount_value:type === "fixed" ? Math.round(rawValue * 100) : Math.round(rawValue), p_max_redemptions:data.get("max_redemptions") ? Number(data.get("max_redemptions")) : null, p_max_redemptions_per_user:Number(data.get("max_redemptions_per_user") || 1), p_starts_at:data.get("starts_at") ? new Date(String(data.get("starts_at"))).toISOString() : null, p_ends_at:data.get("ends_at") ? new Date(String(data.get("ends_at"))).toISOString() : null, p_active:data.get("active") === "on" } });
        form.hidden = true; feedback.textContent = "Cupom salvo com sucesso."; await loadTicketCoupons();
      } catch (saveError) { feedback.textContent = saveError.message || "Não foi possível salvar o cupom."; }
    });
    qs("[data-ticket-coupons]")?.addEventListener("click", async (event) => {
      const card = event.target.closest("[data-coupon-id]"); if (!card) return;
      const coupon = ticketCoupons.find((item) => item.id === card.dataset.couponId); if (!coupon) return;
      if (event.target.closest("[data-edit-ticket-coupon]")) return openCouponForm(coupon);
      const toggle = event.target.closest("[data-toggle-ticket-coupon]"); if (!toggle) return;
      toggle.disabled = true;
      try { await client.rest("rpc/admin_toggle_ticket_purchase_coupon", { method:"POST", body:{ p_id:coupon.id, p_active:toggle.dataset.toggleTicketCoupon === "true" } }); await loadTicketCoupons(); }
      catch (toggleError) { qs("[data-ticket-coupon-admin-feedback]").textContent = toggleError.message || "Não foi possível atualizar o cupom."; toggle.disabled = false; }
    });
    qs("[data-refund-requests]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-refund-status]");
      if (!button) return;
      const card = button.closest("[data-refund-id]");
      const notes = qs("[data-refund-notes]", card)?.value.trim() || null;
      button.disabled = true;
      qs("[data-refund-feedback]").textContent = "Atualizando solicitação...";
      try {
        await client.rest("rpc/admin_update_ticket_refund_request", { method:"POST", body:{ p_request_id:card.dataset.refundId, p_status:button.dataset.refundStatus, p_admin_notes:notes } });
        await loadRefundRequests();
      } catch (error) { qs("[data-refund-feedback]").textContent = error.message || "Não foi possível atualizar."; button.disabled = false; }
    });
    qs(".admin-photo-filters")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-photo-filter]");
      if (!button) return;
      photoFilter = button.dataset.photoFilter;
      qsa("[data-photo-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderConfirmationPhotos();
    });
    qs("[data-confirmation-photos]")?.addEventListener("click", async (event) => {
      const postedButton = event.target.closest("[data-set-photo-posted]");
      const openButton = event.target.closest("[data-open-confirmation-photo]");
      const downloadButton = event.target.closest("[data-download-confirmation-photo]");
      const id = postedButton?.dataset.setPhotoPosted || openButton?.dataset.openConfirmationPhoto || downloadButton?.dataset.downloadConfirmationPhoto;
      const photo = confirmationPhotos.find((item) => item.id === id);
      if (!photo) return;
      if (postedButton) {
        postedButton.disabled = true;
        try {
          await client.rest("rpc/admin_set_confirmation_photo_posted", { method:"POST", body:{ p_media_id:photo.id, p_posted:postedButton.dataset.posted === "true" } });
          await loadConfirmationPhotos();
        } catch (error) {
          qs("[data-photo-feedback]").textContent = error.message || "Não foi possível atualizar a foto.";
          postedButton.disabled = false;
        }
        return;
      }
      try {
        photo.signed_url = photo.signed_url || await client.signedUrl("ticket-confirmations", photo.storage_path, 3600);
        if (openButton) window.open(photo.signed_url, "_blank", "noopener");
        if (downloadButton) {
          const link = document.createElement("a");
          link.href = photo.signed_url;
          link.download = `only-${photo.vehicle_plate || photo.ticket_code || "confirmado"}.jpg`;
          link.target = "_blank";
          link.rel = "noopener";
          link.click();
        }
      } catch (error) { qs("[data-photo-feedback]").textContent = error.message || "Não foi possível abrir a foto."; }
    });
    qs("[data-admin-event-back]")?.addEventListener("click", () => {
      stopScanner();
      selectedEventId = null;
      currentTicket = null;
      confirmationPhotos = [];
      lastToken = "";
      qs("[data-admin-event-gate]").hidden = true;
      qs("[data-admin-panel='tickets']")?.classList.remove("is-event-open");
      qs("[data-admin-events-title]").textContent = "Seus eventos";
      qs("[data-admin-events-description]").textContent = "Escolha um evento para abrir o leitor, os números e a atividade daquela edição.";
      qs("[data-admin-event-back]").hidden = true;
      qsa("[data-gate-event]").forEach((item) => item.classList.remove("active"));
    });
    qs("[data-ticket-result]").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-ticket-action]");
      if (!button || !lastToken || !currentTicket) return;
      const feedback = qs("[data-ticket-action-feedback]");
      button.disabled = true;
      feedback.textContent = "Registrando movimentação...";
      try {
        const updated = await client.rest("rpc/admin_checkin_event_ticket", { method:"POST", body:{ p_qr_token:lastToken, p_action:button.dataset.ticketAction, p_reason:null } });
        renderTicket(updated);
        qs("[data-ticket-action-feedback]").textContent = "Movimentação registrada e sincronizada para todos os administradores.";
        await loadTicketStats();
      } catch (error) { feedback.textContent = error.message; button.disabled = false; }
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopScanner(); });
    loadGateEvents();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupExchangeEnhancer();
    setupScanner();
  });
})();
