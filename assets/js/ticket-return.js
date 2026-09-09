(function () {
  'use strict';
  const root = document.querySelector('[data-ticket-return]'), client = window.OnlySupabase;
  if (!root || !client) return;
  const qs = selector => root.querySelector(selector);
  const title = qs('[data-ticket-return-title]'), text = qs('[data-ticket-return-text]');
  const photos = qs('[data-ticket-return-photos]'), list = qs('[data-ticket-return-photo-list]');
  const template = qs('[data-ticket-return-photo-template]');
  const retry = qs('[data-ticket-return-check]'), login = qs('[data-ticket-return-login]');
  const finish = qs('[data-ticket-return-finish]');
  const order = new URLSearchParams(location.search).get('order');
  let user = null, checking = false, finished = false, attempts = 0, timer = null;
  const mediaByTicket = new Map(), previews = new Map();
  const destination = `ingresso-retorno.html${location.search}`;
  login.href = `login.html?next=${encodeURIComponent(destination)}`;

  function requireLogin() {
    title.textContent = 'Entre para concluir seu ingresso';
    text.textContent = 'Após entrar, você volta para esta etapa para conferir o pagamento e enviar as fotos.';
    login.hidden = false;
    try { sessionStorage.setItem('onlycars.afterLogin', destination); } catch (_) {}
  }

  function updateCompletion() {
    const cards = [...list.querySelectorAll('[data-ticket-return-photo]')];
    const sent = cards.filter(card => Number(card.dataset.submissionCount) > 0).length;
    qs('[data-ticket-return-photo-progress]').textContent = `${sent} de ${cards.length} veículo(s) com foto enviada.`;
    finish.textContent = sent === cards.length ? 'Concluir e ver meus ingressos' : 'Enviar as fotos depois';
  }

  function renderPhotos(tickets) {
    const eligible = tickets.filter(ticket => (ticket.ticket_kind || 'expo') !== 'carona' && ['active', 'checked_in'].includes(ticket.ticket_status));
    photos.hidden = !eligible.length;
    qs('[data-ticket-completion-photo-step]').hidden = !eligible.length;
    qs('[data-ticket-completion-payment-step]').removeAttribute('aria-current');
    if (!eligible.length) { finish.textContent = 'Ver meus ingressos'; return; }
    qs('[data-ticket-completion-photo-step]').setAttribute('aria-current', 'step');
    text.textContent = 'Pagamento confirmado! Agora envie a foto de cada veículo para o post de confirmado.';
    for (const ticket of eligible) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.ticketId = ticket.id;
      card.dataset.submissionCount = String(mediaByTicket.get(ticket.id)?.submission_count || 0);
      card.querySelector('[data-photo-ticket-title]').textContent = `${ticket.ticket_kind === 'combo' ? 'Expo + Carona' : 'Expo'} · ${ticket.ticket_code}`;
      card.querySelector('[data-photo-ticket-vehicle]').textContent = [ticket.vehicle_make, ticket.vehicle_model, ticket.vehicle_plate].filter(Boolean).join(' · ');
      const feedback = card.querySelector('[data-ticket-return-photo-feedback]');
      const count = Number(card.dataset.submissionCount);
      if (count) feedback.textContent = count >= 2 ? 'Foto já enviada. Limite de 2 envios atingido.' : 'Foto já enviada. Você pode substituir mais uma vez.';
      if (count >= 2) card.querySelector('fieldset').disabled = true;
      list.append(card);
    }
    updateCompletion();
  }

  async function check() {
    if (checking || finished) return;
    clearTimeout(timer);
    checking = true; retry.disabled = true; attempts++;
    try {
      if (!order || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order)) {
        title.textContent = 'Pedido não informado';
        text.textContent = 'Abra o link de retorno do pagamento ou consulte seus ingressos em Minha conta.';
        finished = true; return;
      }
      user = await client.getUser();
      if (!user) { requireLogin(); return; }
      login.hidden = true;
      const rows = await client.rest(`ticket_orders?select=status,payment_status&id=eq.${encodeURIComponent(order)}&limit=1`);
      const item = rows?.[0];
      if (!item) {
        title.textContent = 'Pedido não encontrado nesta conta';
        text.textContent = 'Confira se você entrou na mesma conta usada na compra.';
        return;
      }
      if (item.status === 'paid') {
        const tickets = (await client.rest('rpc/customer_event_tickets', { method: 'POST', body: {} }) || []).filter(ticket => ticket.order_id === order);
        if (!tickets.length) throw Error('A confirmação chegou. Estamos carregando seus ingressos; tente novamente em alguns segundos.');
        // RLS restricts this read to the signed-in owner (or an administrator).
        const media = await client.rest(`ticket_media?select=ticket_id,submission_count&ticket_id=in.(${tickets.map(ticket => ticket.id).join(',')})`);
        for (const item of media || []) mediaByTicket.set(item.ticket_id, item);
        title.textContent = 'Ingresso aprovado!';
        text.textContent = 'Pagamento confirmado. Seus ingressos já estão disponíveis.';
        root.classList.add('approved');
        qs('.ticket-return-icon').textContent = '✓';
        renderPhotos(tickets); finished = true; return;
      }
      if (['cancelled', 'refunded', 'chargeback', 'expired'].includes(item.status)) {
        title.textContent = item.status === 'refunded' ? 'Pagamento reembolsado' : 'Pagamento não concluído';
        text.textContent = 'Este pedido não possui um ingresso válido. Consulte os detalhes em Minha conta.';
        finished = true; return;
      }
      title.textContent = 'Pagamento em processamento';
      text.textContent = 'Assim que o pagamento for confirmado, a etapa de envio das fotos aparecerá aqui automaticamente. Você pode manter esta página aberta.';
    } catch (error) {
      if (error.status === 401) { user = null; requireLogin(); }
      else { title.textContent = 'Estamos confirmando seu ingresso'; text.textContent = error.message || 'Não foi possível consultar agora. Tente novamente.'; }
    } finally {
      checking = false; retry.disabled = false; retry.hidden = finished;
      if (!finished && user && attempts < 60) timer = setTimeout(check, 5000);
      if (!finished && attempts >= 60) text.textContent += ' Use “Conferir pagamento” para consultar novamente.';
    }
  }

  list.addEventListener('change', event => {
    if (!event.target.matches('input[type=file]')) return;
    const card = event.target.closest('[data-ticket-return-photo]'), preview = card.querySelector('[data-photo-preview]');
    if (previews.has(card)) URL.revokeObjectURL(previews.get(card));
    const file = event.target.files?.[0];
    const valid = file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 8 * 1024 * 1024;
    preview.hidden = !valid;
    if (valid) { const url = URL.createObjectURL(file); previews.set(card, url); preview.src = url; }
  });

  list.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ticket-return-photo]');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type=submit]'), feedback = form.querySelector('[data-ticket-return-photo-feedback]');
    if (button.disabled || !form.reportValidity()) return;
    const file = form.elements.photo.files?.[0];
    feedback.dataset.error = 'false';
    if (!file || !form.elements.consent.checked) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      feedback.dataset.error = 'true'; feedback.textContent = 'Escolha uma foto JPG, PNG ou WebP de até 8 MB.'; return;
    }
    button.disabled = true; feedback.textContent = 'Enviando foto…';
    try {
      const currentUser = await client.getUser();
      if (!currentUser || currentUser.id !== user?.id) throw Error('Sua sessão mudou. Entre na conta da compra e atualize esta página.');
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      // Keep the uploaded path on a registration retry to avoid uploading the same file twice.
      if (form.uploadedFile !== file) {
        const path = `${user.id}/${form.dataset.ticketId}/${crypto.randomUUID()}.${ext}`;
        await client.upload('ticket-confirmations', path, file);
        form.uploadedFile = file; form.uploadedPath = path;
      }
      const result = await client.rest('rpc/customer_submit_ticket_photo', { method: 'POST', body: { p_ticket_id: form.dataset.ticketId, p_storage_path: form.uploadedPath, p_publication_consent: true } });
      form.dataset.submissionCount = String(result.submission_count);
      feedback.textContent = result.remaining ? 'Foto enviada para revisão! Você pode substituir mais uma vez, se precisar.' : 'Foto enviada para revisão! Limite de 2 envios atingido.';
      form.elements.photo.value = ''; form.uploadedFile = null;
      button.textContent = 'Substituir foto';
      if (!result.remaining) form.querySelector('fieldset').disabled = true;
      updateCompletion();
    } catch (error) { feedback.dataset.error = 'true'; feedback.textContent = error.message || 'Não foi possível enviar a foto. Tente novamente.'; }
    finally { button.disabled = false; }
  });
  retry.addEventListener('click', () => { attempts = 0; check(); });
  window.addEventListener('pagehide', () => { clearTimeout(timer); for (const url of previews.values()) URL.revokeObjectURL(url); });
  check();
})();
