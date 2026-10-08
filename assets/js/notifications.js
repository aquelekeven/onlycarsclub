(() => {
 'use strict';
 const client=window.OnlySupabase, $=(s,r=document)=>r.querySelector(s);
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const icons={bell:['Aviso','M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],ticket:['Ingresso','M3 6h18v12H3zM8 6v12M12 10h5M12 14h5'],car:['Carro','M3 16v-5l3-6h12l3 6v5H3M5 16v3M19 16v3M3 11h18M6 14h2M16 14h2'],calendar:['Agenda','M4 5h16v16H4zM4 10h16M8 2v6M16 2v6'],gift:['Presente','M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C4 8 5 1 9 4zM12 8c8 0 7-7 3-4z'],star:['Destaque','m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'],check:['Confirmado','m4 12 5 5L20 6'],alert:['Atenção','M12 3 2 21h20L12 3M12 9v5M12 17v1'],message:['Mensagem','M3 4h18v13H9l-6 4V4M7 9h10M7 13h7'],info:['Informação','M12 10v7M12 6v1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0']};
 const iconSvg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${(icons[key]||icons.bell)[1]}"/></svg>`;
 const rpc=(name,body={})=>client.rest('rpc/'+name,{method:'POST',body});
 let items=[],busy=false,panel,button,badge,unreadCount=0,filter='all';
 const dayKey=v=>new Date(v).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
 const period=v=>{const today=dayKey(Date.now()),day=dayKey(v);return day===today?'today':(Date.parse(today)-Date.parse(day)<7*86400000?'week':'earlier');};
 const date=v=>new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
 function render(data){
  const expanded=new Set([...panel.querySelectorAll('[data-open-notification][aria-expanded="true"]')].map(n=>n.dataset.openNotification));
  unreadCount=data.unread_count;items=data.items||[]; badge.textContent=data.unread_count>99?'99+':data.unread_count;badge.hidden=!data.unread_count;
  button.setAttribute('aria-label',`Notificações: ${data.unread_count} não lidas`);
  const visible=items.filter(n=>filter==='all'||period(n.created_at)===filter);
  $('[data-notification-list]',panel).innerHTML=visible.length?visible.map(n=>`<article class="only-notification ${n.read_at?'':'unread'}"><button type="button" data-open-notification="${safe(n.id)}" aria-expanded="false"><span class="notification-dot" aria-label="Não lida" ${n.read_at?'hidden':''}></span><i class="notification-item-icon" aria-hidden="true">${iconSvg(n.icon)}</i><strong>${safe(n.title)}</strong><span class="notification-excerpt">${safe(n.body)}</span><time>${date(n.created_at)}</time></button><div data-notification-body="${safe(n.id)}" hidden><p>${safe(n.body)}</p></div>${n.read_at?'<small>Lida</small>':`<button type="button" data-read-notification="${safe(n.id)}">Marcar como lida</button>`}</article>`).join(''):'<p class="only-notification-empty">Nenhuma notificação neste período.</p>';
  panel.querySelectorAll('[data-open-notification]').forEach(n=>{if(expanded.has(n.dataset.openNotification)){n.setAttribute('aria-expanded','true');$('[data-notification-body]',n.parentElement).hidden=false;}});
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
    const open=e.target.closest('[data-open-notification]');let read=e.target.closest('[data-read-notification]');
    if(open){const content=$('[data-notification-body]',open.parentElement);content.hidden=!content.hidden;open.setAttribute('aria-expanded',String(!content.hidden));if(!content.hidden)read=$('[data-read-notification]',open.parentElement);}
    if(read){read.disabled=true;try{await rpc('read_site_notification',{p_id:read.dataset.readNotification});await refresh();}catch(error){$('[data-notification-feedback]',panel).textContent='Não foi possível marcar como lida.';read.disabled=false;}}
   });
   await refresh();setInterval(()=>{if(panel.hidden)refresh();},30000);window.addEventListener('focus',refresh);
  }catch(error){ /* No notification access until an admin session is available. */ }
 }
 async function setupSender(userId){
  const form=$('[data-send-notification]');if(!form)return;
  const feedback=$('[data-send-feedback]');
  const picker=document.createElement('fieldset');picker.className='notification-icon-picker';picker.innerHTML='<legend>Ícone da notificação</legend>'+Object.entries(icons).map(([key,[label]])=>`<label title="${label}"><input type="radio" name="notification_icon" value="${key}" ${key==='bell'?'checked':''}><span>${iconSvg(key)}<small>${label}</small></span></label>`).join('');form.prepend(picker);
  try{const recipients=await rpc('admin_notification_recipients');form.elements.recipient.innerHTML='<option value="">Selecione um administrador</option>'+recipients.map(r=>`<option value="${safe(r.id)}">${safe(r.name)}${r.id===userId?' (você)':''}</option>`).join('');}catch(e){feedback.textContent='Não foi possível carregar os destinatários. Recarregue a página.';return;}
  let sending=false,requestKey=null,snapshot='';
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(sending||!form.reportValidity())return;
   const selectedIcon=form.elements.notification_icon.value;
   const recipient=form.elements.recipient.value,title=form.elements.title.value.trim(),body=form.elements.message.value.trim();
   if(!title||!body){feedback.textContent='Preencha o título e a mensagem.';return;}
   const preview=document.createElement('dialog');preview.className='only-notification-preview';
   preview.innerHTML=`<h2>Enviar notificação?</h2><p>Para <strong>${safe(form.elements.recipient.selectedOptions[0].textContent)}</strong></p><h3><i class="notification-item-icon">${iconSvg(selectedIcon)}</i>${safe(title)}</h3><p class="notification-preview-body">${safe(body)}</p><footer><button type="button" data-back>Voltar</button><button type="button" data-confirm>Enviar notificação</button></footer>`;
   sending=true;document.body.append(preview);preview.showModal();
   $('[data-back]',preview).onclick=()=>preview.close();
   preview.addEventListener('close',()=>{preview.remove();sending=false;});
   $('[data-confirm]',preview).onclick=async()=>{
    const current=JSON.stringify([recipient,title,body,selectedIcon]);if(current!==snapshot||!requestKey){requestKey=crypto.randomUUID();snapshot=current;}
    preview.querySelectorAll('button').forEach(b=>b.disabled=true);preview.oncancel=e=>e.preventDefault();
    try{await rpc('admin_send_site_notification_v2',{p_recipient:recipient,p_title:title,p_body:body,p_key:requestKey,p_icon:selectedIcon});form.reset();requestKey=null;preview.close();feedback.textContent='Notificação enviada. Ela já está disponível no sininho do destinatário.';if(panel)await refresh();}
    catch(error){preview.close();feedback.textContent=error.message||'Não foi possível enviar. Tente novamente.';}
   };
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
