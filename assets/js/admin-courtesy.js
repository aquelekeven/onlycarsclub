(() => {
  'use strict';
  const root=document.querySelector('[data-admin-panel="tickets"]'),client=window.OnlySupabase;
  if(!root||!client)return;
  const qs=s=>root.querySelector(s),form=qs('[data-courtesy-form]'),feedback=qs('[data-courtesy-feedback]');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={expo:'Expo',carona:'Carona Radical',combo:'Expo + Carona'};
  let eventId=null,rows=[];
  function render(){
    const active=rows.filter(row=>row.status!=='cancelled');
    const count=active.reduce((sum,row)=>sum+Number(row.quantity),0);
    qs('[data-courtesy-usage]').textContent=`${count} cortesia(s) reservadas neste evento. O limite configurado para o evento é aplicado ao salvar.`;
    qs('[data-courtesy-list]').innerHTML=rows.length?rows.map(row=>`<article class="admin-courtesy-row" data-invite-id="${esc(row.id)}"><div><strong>${esc(row.partner_name||row.recipient_name)}</strong><span>${row.partner_name?`${esc(row.recipient_name)} · `:''}${esc(row.email)}</span></div><div><b>${row.quantity} × ${esc(labels[row.ticket_kind]||row.ticket_kind)}</b><span>${row.status==='claimed'?'Resgatada':row.status==='cancelled'?'Cancelada':'Aguardando conta confirmada'}</span></div>${row.status==='pending'?'<div class="admin-courtesy-actions"><button type="button" data-edit-courtesy>Editar</button><button type="button" data-cancel-courtesy>Cancelar</button></div>':''}</article>`).join(''):'<p class="admin-coupon-empty">Nenhuma cortesia cadastrada para este evento.</p>';
  }
  async function refresh(){
    if(!eventId)return;
    try{const current=eventId;const response=await client.rest('rpc/admin_list_courtesy_invites',{method:'POST',body:{p_event_id:current}});if(current!==eventId)return;rows=Array.isArray(response)?response:[];render();feedback.textContent='';}
    catch(err){feedback.textContent=err.message||'Não foi possível carregar as cortesias.';}
  }
  function open(item){form.reset();form.elements.invite_id.value=item?.id||'';form.elements.partner.value=item?.partner_name||'';form.elements.recipient_name.value=item?.recipient_name||'';form.elements.email.value=item?.email||'';form.elements.ticket_kind.value=item?.ticket_kind||'expo';form.elements.quantity.value=item?.quantity||1;form.hidden=false;form.elements.recipient_name.focus();feedback.textContent='';}
  document.addEventListener('only:admin-event-selected',event=>{eventId=event.detail.id;rows=[];form.hidden=true;render();});
  qs('[data-event-view-button="courtesy"]').addEventListener('click',refresh);
  qs('[data-new-courtesy]').addEventListener('click',()=>open(null));
  qs('[data-cancel-courtesy-form]').addEventListener('click',()=>{form.hidden=true;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!eventId||!form.reportValidity())return;
    const button=form.querySelector('[type=submit]');button.disabled=true;feedback.textContent='Salvando convite...';
    try{await client.rest('rpc/admin_save_courtesy_invite',{method:'POST',body:{p_event_id:eventId,p_id:form.elements.invite_id.value||null,p_partner:form.elements.partner.value.trim()||null,p_name:form.elements.recipient_name.value.trim(),p_email:form.elements.email.value.trim(),p_ticket_kind:form.elements.ticket_kind.value,p_quantity:Number(form.elements.quantity.value)}});form.hidden=true;await refresh();feedback.textContent='Cortesia reservada para o e-mail informado.';}
    catch(err){feedback.textContent=err.message||'Não foi possível salvar o convite.';}
    finally{button.disabled=false;}
  });
  qs('[data-courtesy-list]').addEventListener('click',async event=>{
    const button=event.target.closest('button'),card=button?.closest('[data-invite-id]');if(!card)return;
    const item=rows.find(row=>row.id===card.dataset.inviteId);if(!item)return;
    if(button.hasAttribute('data-edit-courtesy'))return open(item);
    if(!button.hasAttribute('data-cancel-courtesy')||!window.confirm(`Cancelar a cortesia de ${item.recipient_name}? O convite ainda não foi resgatado.`))return;
    button.disabled=true;
    try{await client.rest('rpc/admin_cancel_courtesy_invite',{method:'POST',body:{p_event_id:eventId,p_id:item.id}});await refresh();feedback.textContent='Convite cancelado.';}
    catch(err){feedback.textContent=err.message||'Não foi possível cancelar.';button.disabled=false;}
  });
})();
