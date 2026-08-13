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

  async function loadTicketStats() {
    if (!selectedEventId) return;
    try {
      const data = await client.rest("rpc/admin_event_gate_summary_for_event", { method:"POST", body:{ p_event_id:selectedEventId } });
      qs("[data-ticket-stat-active]").textContent = data.active_tickets || 0;
      qs("[data-ticket-stat-inside]").textContent = data.inside_event || 0;
      qs("[data-ticket-stat-today]").textContent = data.movements_today || 0;
      const activity = qs("[data-ticket-activity]");
      activity.innerHTML = data.recent_activity?.length ? data.recent_activity.map((item) => `<article><i data-action="${escapeHtml(item.action)}"></i><div><strong>${escapeHtml(item.ticket_code)} · ${escapeHtml(item.driver_name)}</strong><span>${escapeHtml(item.vehicle_plate)} · ${escapeHtml(item.action_label)}</span></div><time>${dateTime(item.created_at)}</time></article>`).join("") : '<div class="admin-ticket-activity-empty">Nenhuma movimentação registrada ainda.</div>';
    } catch (error) {
      setScannerFeedback("Execute a migração do leitor de ingressos para ativar esta área.", "warning");
    }
  }

  async function loadGateEvents() {
    const root = qs("[data-admin-event-selector]");
    const gate = qs("[data-admin-event-gate]");
    if (!root || !gate) return;
    try {
      const events = await client.rest("rpc/admin_event_gate_events", { method:"POST", body:{} });
      root.innerHTML = events?.length ? events.map((event) => `<button type="button" data-gate-event="${escapeHtml(event.id)}"><span>${new Date(event.starts_at).toLocaleDateString("pt-BR")}</span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.venue_name || "Local a confirmar")} · ${Number(event.ticket_count || 0)} ingressos</small><i>→</i></button>`).join("") : '<div class="admin-ticket-activity-empty">Nenhum evento cadastrado.</div>';
      root.onclick = async (clickEvent) => {
        const button = clickEvent.target.closest("[data-gate-event]");
        if (!button) return;
        selectedEventId = button.dataset.gateEvent;
        qsa("[data-gate-event]", root).forEach((item) => item.classList.toggle("active", item === button));
        gate.hidden = false;
        stopScanner();
        qs("[data-ticket-result]").innerHTML = '<div class="admin-ticket-empty"><i>⌁</i><strong>Nenhum ingresso lido</strong><span>Os dados do motorista e do veículo aparecerão aqui antes da confirmação.</span></div>';
        setScannerFeedback("Evento selecionado. Inicie a câmera ou utilize a leitura manual.", "success");
        await loadTicketStats();
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
    qs("[data-scanner-search]").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); inspectToken(qs("[data-scanner-input]").value).catch((error) => setScannerFeedback(error.message, "error")); });
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
    loadGateEvents();
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupExchangeEnhancer();
    setupScanner();
  });
})();
