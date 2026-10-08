(() => {
 'use strict';
 const client=window.OnlySupabase, $=(s,r=document)=>r.querySelector(s);
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={bell:['Aviso','M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],ticket:['Ingresso','M3 6h18v12H3zM8 6v12M12 10h5M12 14h5'],car:['Carro','M3 16v-5l3-6h12l3 6v5H3M5 16v3M19 16v3M3 11h18M6 14h2M16 14h2'],calendar:['Agenda','M4 5h16v16H4zM4 10h16M8 2v6M16 2v6'],gift:['Presente','M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C4 8 5 1 9 4zM12 8c8 0 7-7 3-4z'],star:['Destaque','m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'],check:['Confirmado','m4 12 5 5L20 6'],alert:['Atenção','M12 3 2 21h20L12 3M12 9v5M12 17v1'],message:['Mensagem','M3 4h18v13H9l-6 4V4M7 9h10M7 13h7'],info:['Informação','M12 10v7M12 6v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0']};
 const iconSvg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${(icons[key]||icons.bell)[1]}"/></svg>`;
 const safeLink=value=>{if(!value)return '';try{const url=new URL(value,location.origin);return (url.protocol==='https:'&&!String(value).includes('\\'))?url.href:'';}catch{return '';}};
 const rpc=(name,body={})=>client.rest('rpc/'+name,{method:'POST',body});
 let items=[],busy=false,panel,button,badge,unreadCount=0,filter='all';
 const dayKey=v=>new Date(v).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const period=v=>{const today=dayKey(Date.now()),day=dayKey(v);return day===today?'today':(Date.parse(today)-Date.parse(day)<7*86400000?'week':'earlier');};
 const date=v=>new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
 function render(data){
  const previousScroll=panel.scrollTop;
  const expanded=new Set([...panel.querySelectorAll('[data-open-notification][aria-expanded="true"]')].map(n=>n.dataset.openNotification));
  unreadCount=data.unread_count;items=[...(data.items||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id).localeCompare(String(a.id))); badge.textContent=data.unread_count>99?'99+':data.unread_count;badge.hidden=!data.unread_count;
  button.setAttribute('aria-label',`Notificações: ${data.unread_count} não lidas`);
  const visible=items.filter(n=>filter==='all'||period(n.created_at)===filter);
  $('[data-notification-list]',panel).innerHTML=visible.length?visible.map(n=>`<article class="only-notification ${n.read_at?'is-read':'unread'}"><button type="button" data-open-notification="${safe(n.id)}" aria-expanded="false"><span class="notification-dot" aria-label="Não lida" ${n.read_at?'hidden':''}></span><i class="notification-item-icon" aria-hidden="true">${iconSvg(n.icon)}</i><strong>${safe(n.title)}</strong><span class="notification-excerpt">${safe(n.body)}</span><time>${date(n.created_at)}</time></button><div data-notification-body="${safe(n.id)}" hidden><p>${safe(n.body)}</p>${safeLink(n.link_url)?`<a class="notification-action-link" href="${safe(safeLink(n.link_url))}" target="_blank" rel="noopener noreferrer">${safe(n.link_label||"Ver detalhes")} ↗</a>`:""}</div>${n.read_at?`<button type="button" data-unread-notification="${safe(n.id)}">Marcar como não lida</button>`:`<button type="button" data-read-notification="${safe(n.id)}">Marcar como lida</button>`}</article>`).join(''):'<p class="only-notification-empty">Nenhuma notificação neste período.</p>';
  panel.querySelectorAll('[data-open-notification]').forEach(n=>{if(expanded.has(n.dataset.openNotification)){n.setAttribute('aria-expanded','true');$('[data-notification-body]',n.parentElement).hidden=false;n.parentElement.classList.add('is-selected');}});
  panel.scrollTop=previousScroll;
 }
 async function refresh(){if(busy||document.hidden)return;busy=true;try{render(await rpc('my_site_notifications'));$('[data-notification-feedback]',panel).textContent='';}catch(e){$('[data-notification-feedback]',panel).textContent='Não foi possível atualizar. Tente novamente.';}finally{busy=false;}}
 function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
 async function init(){
  if(!client||!$('.header'))return;
  try {
   const user=await client.getUser();if(!user)return;
   const profiles=await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=role`);
   if(profiles?.[0]?.role!=='admin')return;
   await setupSender(user.id);
   if(document.body.dataset.page!=='conta')return;
   button=document.createElement('button');button.type='button';button.className='only-notification-bell';button.setAttribute('aria-label','Notificações');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','only-notifications');
   button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><b hidden></b>';badge=$('b',button);$('.header').append(button);
   panel=document.createElement('section');panel.id='only-notifications';panel.className='only-notifications';panel.hidden=true;panel.setAttribute('aria-label','Notificações');
   panel.innerHTML='<header><div><span>ONLY CARS</span><h2>Notificações</h2></div><button type="button" data-notification-filter="all">Ver todas</button><button type="button" data-close-notifications aria-label="Fechar notificações">×</button></header><nav class="notification-periods" aria-label="Período das notificações"><button type="button" data-notification-filter="today">Hoje</button><button type="button" data-notification-filter="week">Esta semana</button><button type="button" data-notification-filter="earlier">Anteriores</button></nav><p data-notification-feedback role="status"></p><div data-notification-list></div><button type="button" data-refresh-notifications>Atualizar</button>';document.body.append(panel);
   button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh();};
   $('[data-close-notifications]',panel).onclick=()=>{close();button.focus();};$('[data-refresh-notifications]',panel).onclick=refresh;
   document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))close();});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){close();button.focus();}});
   panel.addEventListener('click',async e=>{
    const periodButton=e.target.closest('[data-notification-filter]');if(periodButton){filter=periodButton.dataset.notificationFilter;panel.querySelectorAll('[data-notification-filter]').forEach(b=>{b.classList.toggle('active',b===periodButton);b.setAttribute('aria-pressed',String(b===periodButton));});render({items,unread_count:unreadCount});return;}
    const unread=e.target.closest('[data-unread-notification]');
    if(unread){unread.disabled=true;try{await client.rest('site_notifications?id=eq.'+encodeURIComponent(unread.dataset.unreadNotification),{method:'PATCH',body:{read_at:null}});const row=unread.closest('.only-notification');row.classList.remove('is-selected');$('[data-open-notification]',row).setAttribute('aria-expanded','false');$('[data-notification-body]',row).hidden=true;await refresh();}catch(error){$('[data-notification-feedback]',panel).textContent='Não foi possível marcar como não lida.';unread.disabled=false;}return;}
    const open=e.target.closest('[data-open-notification]');let read=e.target.closest('[data-read-notification]');
    if(open){const content=$('[data-notification-body]',open.parentElement);const opening=content.hidden;panel.querySelectorAll('[data-open-notification]').forEach(other=>{if(other!==open){other.setAttribute('aria-expanded','false');other.parentElement.classList.remove('is-selected');$('[data-notification-body]',other.parentElement).hidden=true;}});content.hidden=!opening;open.setAttribute('aria-expanded',String(!content.hidden));open.parentElement.classList.toggle('is-selected',!content.hidden);if(!content.hidden)read=$('[data-read-notification]',open.parentElement);}
    if(read){read.disabled=true;try{await rpc('read_site_notification',{p_id:read.dataset.readNotification});await refresh();}catch(error){$('[data-notification-feedback]',panel).textContent='Não foi possível marcar como lida.';read.disabled=false;}}
   });
   await refresh();setInterval(()=>{if(panel.hidden)refresh();},30000);window.addEventListener('focus',refresh);
  }catch(error){ /* No notification access until an admin session is available. */ }
 }
 async function setupSender(userId){
  const form=$('[data-send-notification]');if(!form)return;
  const feedback=$('[data-send-feedback]');
  const picker=document.createElement('fieldset');picker.className='notification-icon-picker';picker.innerHTML='<legend>Ícone da notificação</legend>'+Object.entries(icons).map(([key,[label]])=>`<label title="${label}"><input type="radio" name="notification_icon" value="${key}" ${key==='bell'?'checked':''}><span>${iconSvg(key)}<small>${label}</small></span></label>`).join('');form.prepend(picker);
  const filters=document.createElement('div');filters.className='notification-audience-filters';filters.innerHTML='<label>Filtrar membros<select name="segment"><option value="all">Todos os administradores</option><option value="expo">Comprou Expo</option><option value="carona">Comprou Carona Radical</option><option value="combo">Comprou combo</option><option value="courtesy">Tem cortesia ativa</option><option value="no_purchase">Ainda não comprou</option></select></label><label>Evento<select name="audience_event"><option value="">Selecione um evento</option></select></label><p data-audience-count role="status">O filtro define o grupo; abaixo você escolhe para quem enviar.</p>';picker.after(filters);
  const links=document.createElement('div');links.className='notification-link-fields';links.innerHTML='<label>Link (opcional)<input name="notification_url" maxlength="2048" placeholder="https://onlycarsclub.com.br/proximo-evento.html"></label><label>Texto do botão<input name="notification_link_label" maxlength="60" placeholder="Ex.: Garantir meu ingresso"></label>';form.querySelector('button[type="submit"]').before(links);
  let recipients=[],audienceVersion=0;
  async function loadAudience(){const version=++audienceVersion;form.elements.recipient.disabled=true;recipients=[];form.elements.recipient.innerHTML='<option value="">Carregando...</option>';try{const segment=form.elements.segment.value,eventId=form.elements.audience_event.value;if(segment!=='all'&&!eventId){form.elements.recipient.innerHTML='<option value="">Selecione um evento acima</option>';$('[data-audience-count]',form).textContent='Escolha o evento para filtrar.';return;}const result=await rpc('admin_notification_audience',{p_segment:segment,p_event:eventId||null});if(version!==audienceVersion)return;recipients=result;form.elements.recipient.innerHTML='<option value="">Selecione o destinatário</option>'+ (recipients.length?`<option value="group">Todos deste filtro (${recipients.length})</option>`:'')+recipients.map(r=>`<option value="${safe(r.id)}">${safe(r.name)}${r.id===userId?' (você)':''}</option>`).join('');$('[data-audience-count]',form).textContent=`${recipients.length} administrador(es) neste filtro. Clientes ainda não recebem nesta fase.`;form.elements.recipient.disabled=!recipients.length;}catch(e){$('[data-audience-count]',form).textContent='Não foi possível carregar. Altere o filtro para tentar novamente.';}}
  form.elements.segment.onchange=loadAudience;form.elements.audience_event.onchange=loadAudience;
  async function loadEvents(){try{const events=await rpc('admin_event_gate_events');form.elements.audience_event.innerHTML='<option value="">Selecione um evento</option>'+events.map(e=>`<option value="${safe(e.id)}">${safe(e.name)}${e.starts_at?' · '+new Date(e.starts_at).toLocaleDateString('pt-BR'):''}</option>`).join('');const current=events.find(e=>e.status==='sales_open')||events[0];if(current){form.elements.audience_event.value=current.id;[...form.elements.audience_event.options].forEach(o=>o.defaultSelected=o.value===current.id);}}catch{$('[data-audience-count]',form).textContent='Não foi possível carregar os eventos. Clique em Recarregar eventos.';}}
  const retry=document.createElement('button');retry.type='button';retry.textContent='Recarregar eventos';retry.onclick=async()=>{await loadEvents();await loadAudience();};filters.append(retry);
  await loadEvents();
  await loadAudience();
  let sending=false,requestKey=null,snapshot='';
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(sending||!form.reportValidity())return;
   const selectedIcon=form.elements.notification_icon.value;
   const recipient=form.elements.recipient.value,title=form.elements.title.value.trim(),body=form.elements.message.value.trim();
   const recipientIds=recipient==='group'?recipients.map(r=>r.id):recipients.filter(r=>r.id===recipient).map(r=>r.id);
   if(!recipientIds.length){feedback.textContent='Selecione um público válido.';return;}
   const rawUrl=form.elements.notification_url.value.trim(),linkLabel=form.elements.notification_link_label.value.trim();
   const url=safeLink(rawUrl);if(rawUrl&&!url){feedback.textContent='Informe um link HTTPS válido.';return;}
   if(!title||!body){feedback.textContent='Preencha o título e a mensagem.';return;}
   const preview=document.createElement('dialog');preview.className='only-notification-preview';
   preview.innerHTML=`<h2>Enviar notificação?</h2><p>Para <strong>${safe(form.elements.recipient.selectedOptions[0].textContent)}</strong></p><h3><i class="notification-item-icon">${iconSvg(selectedIcon)}</i>${safe(title)}</h3><p class="notification-preview-body">${safe(body)}</p>${url?`<p>Botão: <strong>${safe(linkLabel||"Ver detalhes")}</strong><br><small>${safe(url)}</small></p>`:""}<footer><button type="button" data-back>Voltar</button><button type="button" data-confirm>Enviar notificação</button></footer>`;
   sending=true;document.body.append(preview);preview.showModal();
   $('[data-back]',preview).onclick=()=>preview.close();
   preview.addEventListener('close',()=>{preview.remove();sending=false;});
   $('[data-confirm]',preview).onclick=async()=>{
    const current=JSON.stringify([recipientIds,title,body,selectedIcon,url,linkLabel]);if(current!==snapshot||!requestKey){requestKey=crypto.randomUUID();snapshot=current;}
    preview.querySelectorAll('button').forEach(b=>b.disabled=true);preview.oncancel=e=>e.preventDefault();
    try{await rpc('admin_send_site_notification_v3',{p_recipients:recipientIds,p_title:title,p_body:body,p_key:requestKey,p_icon:selectedIcon,p_url:url||null,p_label:linkLabel||null});form.reset();await loadAudience();requestKey=null;preview.close();feedback.textContent='Notificação enviada. Ela já está disponível no sininho do destinatário.';if(panel)await refresh();}
    catch(error){preview.close();feedback.textContent=error.message||'Não foi possível enviar. Tente novamente.';}
   };
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
