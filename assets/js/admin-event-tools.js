(() => {
  "use strict";

  const client = window.OnlySupabase;
  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[character]);
  const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" }) : "—";

  const exchangeSteps = [
    ["received", "Recebida"], ["under_review", "Em análise"],
    ["awaiting_return", "Aguardando envio"], ["return_in_transit", "Em devolução"],
    ["received_return", "Produto recebido"], ["exchange_sent", "Troca enviada"],
    ["refunded", "Reembolsada"], ["completed", "Concluída"],
    ["rejected", "Não aprovada"], ["cancelled", "Cancelada"]
  ];
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
    quick.innerHTML = `<div class="admin-exchange-quick-heading"><span>Atualização rápida</span><small>Escolha a etapa e revise a mensagem antes de salvar.</small></div><div class="admin-exchange-step-buttons">${exchangeSteps.map(([value,label]) => `<button type="button" data-exchange-quick-status="${value}" class="${select.value === value ? "active" : ""}"><i></i><span>${label}</span></button>`).join("")}</div>`;
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
      select.value = button.dataset.exchangeQuickStatus;
      qsa("[data-exchange-quick-status]", quick).forEach((item) => item.classList.toggle("active", item === button));
      if (!customerMessage.value.trim() && messageTemplates[select.value]) customerMessage.value = messageTemplates[select.value];
    });
    templates.addEventListener("click", (event) => {
      const button = event.target.closest("[data-exchange-template]");
      if (!button) return;
      customerMessage.value = messageTemplates[button.dataset.exchangeTemplate] || "";
      customerMessage.focus();
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
  let lastToken = "";
  let currentTicket = null;

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
      <dl><div><dt>Veículo</dt><dd>${escapeHtml([ticket.vehicle_make,ticket.vehicle_model,ticket.vehicle_year].filter(Boolean).join(" "))}</dd></div><div><dt>Placa</dt><dd class="plate">${escapeHtml(ticket.vehicle_plate)}</dd></div><div><dt>Cor</dt><dd>${escapeHtml(ticket.vehicle_color)}</dd></div><div><dt>Evento</dt><dd>${escapeHtml(ticket.event_name)}</dd></div><div><dt>Última entrada</dt><dd>${dateTime(ticket.last_entry_at)}</dd></div><div><dt>Última saída</dt><dd>${dateTime(ticket.last_exit_at)}</dd></div></dl>
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

  async function scanLoop() {
    if (!scanning || !detector || !qs("[data-scanner-video]")) return;
    const video = qs("[data-scanner-video]");
    if (video.readyState >= 2) {
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) { await inspectToken(codes[0].rawValue); return; }
      } catch (error) {
        if (scanning) setScannerFeedback("Mantenha o QR centralizado e com boa iluminação.");
      }
    }
    scanFrame = requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      setScannerFeedback("A leitura automática não está disponível neste navegador. Use o campo manual abaixo.", "warning");
      qs("[data-scanner-input]")?.focus();
      return;
    }
    try {
      detector = new BarcodeDetector({ formats:["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:"environment" }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
      const video = qs("[data-scanner-video]");
      video.srcObject = stream;
      await video.play();
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
    cancelAnimationFrame(scanFrame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = qs("[data-scanner-video]");
    if (video) video.srcObject = null;
    qs("[data-scanner-viewport]")?.classList.remove("active");
    if (qs("[data-scanner-start]")) qs("[data-scanner-start]").disabled = false;
    if (qs("[data-scanner-stop]")) qs("[data-scanner-stop]").disabled = true;
  }

  async function loadTicketStats() {
    try {
      const data = await client.rest("rpc/admin_event_gate_summary", { method:"POST", body:{} });
      qs("[data-ticket-stat-active]").textContent = data.active_tickets || 0;
      qs("[data-ticket-stat-inside]").textContent = data.inside_event || 0;
      qs("[data-ticket-stat-today]").textContent = data.movements_today || 0;
      const activity = qs("[data-ticket-activity]");
      activity.innerHTML = data.recent_activity?.length ? data.recent_activity.map((item) => `<article><i data-action="${escapeHtml(item.action)}"></i><div><strong>${escapeHtml(item.ticket_code)} · ${escapeHtml(item.driver_name)}</strong><span>${escapeHtml(item.vehicle_plate)} · ${escapeHtml(item.action_label)}</span></div><time>${dateTime(item.created_at)}</time></article>`).join("") : '<div class="admin-ticket-activity-empty">Nenhuma movimentação registrada ainda.</div>';
    } catch (error) {
      setScannerFeedback("Execute a migração do leitor de ingressos para ativar esta área.", "warning");
    }
  }

  function setupScanner() {
    if (!qs("[data-admin-panel='tickets']")) return;
    qs("[data-scanner-start]").addEventListener("click", startScanner);
    qs("[data-scanner-stop]").addEventListener("click", stopScanner);
    qs("[data-scanner-search]").addEventListener("click", () => inspectToken(qs("[data-scanner-input]").value).catch((error) => setScannerFeedback(error.message, "error")));
    qs("[data-scanner-input]").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); qs("[data-scanner-search]").click(); } });
    qs("[data-ticket-refresh]").addEventListener("click", loadTicketStats);
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
    loadTicketStats();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupExchangeEnhancer();
    setupScanner();
  });
})();
