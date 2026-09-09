(function () {
  'use strict';
  const root=document.querySelector('[data-ticket-checkout]'),client=window.OnlySupabase,model=window.OnlyTicketOptions;
  if(!root||!client||!model)return;
  const form=root.querySelector('[data-ticket-form]'),submit=root.querySelector('[data-ticket-submit]'),error=root.querySelector('[data-ticket-error]');
  const vehicles=root.querySelector('[data-ticket-vehicles]'),template=vehicles.firstElementChild.cloneNode(true);
  const selection=model.selection(location.search);
  if(!model.kinds.some(kind=>new URLSearchParams(location.search).has(kind)))selection.expo=1;
  let eventData=null,catalog=null,buyerProfile=null,appliedCoupon=null;
  const digits=value=>String(value||'').replace(/\D/g,'');
  const cpf=value=>digits(value).slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  const phone=value=>digits(value).slice(0,11).replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2');
  const useAccount=root.querySelector('[data-ticket-use-account]'),accountLabel=root.querySelector('[data-ticket-account-data]');
  const couponInput=root.querySelector('[data-ticket-coupon-code]'),couponButton=root.querySelector('[data-ticket-coupon-apply]'),couponFeedback=root.querySelector('[data-ticket-coupon-feedback]');
  const subtotal=()=>catalog?model.total(selection,catalog.prices):0;
  function clearCoupon(){appliedCoupon=null;root.querySelector('[data-ticket-discount-line]').hidden=true;root.querySelector('[data-ticket-total]').textContent=catalog?model.money(subtotal()):'—';}
  function buildTickets(){
    vehicles.replaceChildren();let index=0;
    model.kinds.forEach(kind=>{for(let i=0;i<selection[kind];i++){
      index++;const card=template.cloneNode(true);card.dataset.ticketKind=kind;card.dataset.ticketIndex=String(index);
      card.querySelector('legend').textContent=`${model.names[kind]} · ingresso ${index}`;
      ['name','tax-id','phone'].forEach(field=>{const input=card.querySelector(`[data-ticket-holder-${field}]`);input.name=`holder_${field.replace('-','_')}_${index}`;input.required=false;input.disabled=true;});
      const vehicleFields=card.querySelector('.ticket-vehicle-fields');vehicleFields.hidden=kind==='carona';
      vehicleFields.querySelectorAll('input').forEach(input=>{input.disabled=kind==='carona';input.required=kind!=='carona'&&input.name!=='instagram_handle';});
      const note=document.createElement('p');note.className='ticket-kind-note';note.textContent=kind==='carona'?'Informe o participante da Carona. Não é necessário cadastrar veículo.':kind==='combo'?'A Carona deste combo será utilizada pelo titular informado abaixo.':'Cadastre o veículo que entrará na exposição.';
      card.querySelector('legend').after(note);vehicles.append(card);
    }});
  }
  vehicles.addEventListener('change',event=>{
    if(!event.target.matches('[data-ticket-other-holder]'))return;
    const fields=event.target.closest('[data-ticket-vehicle]').querySelector('[data-ticket-holder-fields]');fields.hidden=!event.target.checked;
    fields.querySelectorAll('input').forEach(input=>{input.required=event.target.checked;input.disabled=!event.target.checked;});
  });
  form.addEventListener('input',event=>{if(event.target.matches('[name="buyer_tax_id"],[data-ticket-holder-tax-id]'))event.target.value=cpf(event.target.value);if(event.target.matches('[name="buyer_phone"],[data-ticket-holder-phone]'))event.target.value=phone(event.target.value);});
  useAccount.addEventListener('change',()=>{
    if(!useAccount.checked||!buyerProfile)return;
    form.elements.buyer_name.value=buyerProfile.display_name||'';form.elements.buyer_tax_id.value=cpf(buyerProfile.tax_id);form.elements.buyer_phone.value=phone(buyerProfile.phone);accountLabel.textContent='Dados preenchidos. Confira e complete o que faltar.';
  });
  function renderSummary(){
    const container=root.querySelector('[data-ticket-order-items]');container.replaceChildren();
    model.kinds.filter(kind=>selection[kind]).forEach(kind=>{const line=document.createElement('div');line.className='ticket-order-item';const label=document.createElement('span'),value=document.createElement('strong');label.textContent=`${selection[kind]} × ${model.names[kind]}`;value.textContent=model.money(selection[kind]*catalog.prices[kind]);line.append(label,value);container.append(line);});
    root.querySelector('[data-ticket-quantity]').textContent=`${model.count(selection)} ingresso(s)`;
    root.querySelector('[data-ticket-order-description]').textContent=selection.combo?'O valor do combo já inclui 10% de desconto sobre Expo + Carona.':'Confira seus ingressos antes de pagar.';
    root.querySelector('[data-expo-photo-note]').hidden=selection.expo+selection.combo===0;
    // Existing purchase coupons apply to Expo-only orders; combo already has its automatic discount.
    root.querySelector('[data-ticket-coupon]').hidden=selection.carona+selection.combo>0;
    clearCoupon();
  }
  async function applyCoupon(){
    clearCoupon();const code=couponInput.value.trim().toUpperCase();couponInput.value=code;
    if(!code){couponFeedback.textContent='Digite o código do cupom.';return;}
    if(!eventData||selection.carona+selection.combo>0)return;
    couponButton.disabled=true;couponFeedback.textContent='Validando cupom…';
    try{const result=await client.rest('rpc/preview_ticket_purchase_coupon',{method:'POST',body:{p_event_id:eventData.id,p_code:code,p_subtotal_cents:subtotal()}});appliedCoupon=result;root.querySelector('[data-ticket-coupon-label]').textContent=result.code;root.querySelector('[data-ticket-discount]').textContent=`− ${model.money(result.discount_cents)}`;root.querySelector('[data-ticket-discount-line]').hidden=false;root.querySelector('[data-ticket-total]').textContent=model.money(result.payable_cents);couponFeedback.textContent=result.description||'Cupom aplicado.';}catch(e){couponFeedback.textContent=e.message||'Cupom indisponível.';}finally{couponButton.disabled=false;}
  }
  couponButton.addEventListener('click',applyCoupon);couponInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyCoupon();}});couponInput.addEventListener('input',()=>{if(appliedCoupon){clearCoupon();couponFeedback.textContent='Aplique novamente após alterar o código.';}});
  async function initialize(){
    try{
      if(!model.count(selection)||model.count(selection)>model.limit)throw Error('Seleção inválida. Volte ao evento para escolher seus ingressos.');
      const user=await client.getUser().catch(()=>null);
      if(!user){sessionStorage.setItem('onlycars.afterLogin',`${location.pathname.split('/').pop()}${location.search}`);location.replace('login.html?next=ingresso');return;}
      buyerProfile=(await client.rest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=birth_date,display_name,phone,tax_id`))?.[0];
      if(!buyerProfile?.birth_date)throw Error('Informe sua data de nascimento em Minha conta antes de comprar.');
      const birth=new Date(`${buyerProfile.birth_date}T12:00:00`),today=new Date();let age=today.getFullYear()-birth.getFullYear();if(today.getMonth()<birth.getMonth()||(today.getMonth()===birth.getMonth()&&today.getDate()<birth.getDate()))age--;
      if(!Number.isFinite(birth.getTime())||age<18)throw Error('A compra deve ser feita na conta de um responsável com 18 anos ou mais.');
      eventData=await client.publicRest('rpc/public_event_summary',{method:'POST',body:{target_slug:root.dataset.eventSlug}});catalog=model.catalog(eventData);
      const issue=model.validate(selection,catalog);if(issue)throw Error(issue);
      buildTickets();renderSummary();root.querySelector('[data-ticket-loading]').textContent='Opções e valores conferidos.';submit.disabled=false;
    }catch(e){error.textContent=e.message||'Não foi possível carregar os ingressos. Atualize a página para tentar novamente.';root.querySelector('[data-ticket-loading]').textContent='Compra indisponível. Confira a mensagem abaixo do formulário.';}
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!catalog||submit.disabled||!form.reportValidity())return;
    const buyer={name:form.elements.buyer_name.value.trim(),tax_id:digits(form.elements.buyer_tax_id.value),phone:digits(form.elements.buyer_phone.value)};
    const tickets=[...vehicles.querySelectorAll('[data-ticket-vehicle]')].map(card=>{
      const other=card.querySelector('[data-ticket-other-holder]').checked;
      return {ticket_kind:card.dataset.ticketKind,driver_name:other?card.querySelector('[data-ticket-holder-name]').value.trim():buyer.name,driver_tax_id:other?digits(card.querySelector('[data-ticket-holder-tax-id]').value):buyer.tax_id,driver_phone:other?digits(card.querySelector('[data-ticket-holder-phone]').value):buyer.phone,holder_is_buyer:!other,
        vehicle_plate:card.dataset.ticketKind==='carona'?'':card.querySelector('[name="vehicle_plate"]').value.replace(/[^a-z0-9]/gi,'').toUpperCase(),vehicle_make:card.dataset.ticketKind==='carona'?'':card.querySelector('[name="vehicle_make"]').value.trim(),vehicle_model:card.dataset.ticketKind==='carona'?'':card.querySelector('[name="vehicle_model"]').value.trim(),instagram_handle:card.querySelector('[name="instagram_handle"]').value.trim()};
    });
    error.textContent='';
    if(!buyer.name||buyer.tax_id.length!==11||buyer.phone.length<10||buyer.phone.length>11){error.textContent='Confira nome, CPF e WhatsApp do comprador.';return;}
    if(tickets.some(t=>!t.driver_name||t.driver_tax_id.length!==11||t.driver_phone.length<10||t.driver_phone.length>11)){error.textContent='Confira os dados dos participantes.';return;}
    const expo=tickets.filter(t=>t.ticket_kind!=='carona');
    if(expo.some(t=>t.vehicle_plate.length!==7||!t.vehicle_make||!t.vehicle_model)){error.textContent='Confira placa, marca e modelo dos veículos.';return;}
    if(new Set(expo.map(t=>t.vehicle_plate)).size!==expo.length){error.textContent='Cada ingresso Expo ou combo precisa de uma placa diferente.';return;}
    submit.disabled=true;submit.textContent='Conferindo disponibilidade…';
    try{
      const fresh=await client.publicRest('rpc/public_event_summary',{method:'POST',body:{target_slug:root.dataset.eventSlug}}),latest=model.catalog(fresh),issue=model.validate(selection,latest);
      if(issue)throw Error(issue);
      if(subtotal()!==model.total(selection,latest.prices)){catalog=latest;eventData=fresh;renderSummary();throw Error('O lote mudou. Confira o novo total e continue novamente.');}
      catalog=latest;submit.textContent='Abrindo Mercado Pago…';
      const response=await client.invokeFunction('mercado-pago-ingresso',{event_slug:root.dataset.eventSlug,lot_id:catalog.lot?.id||null,buyer_name:buyer.name,buyer_tax_id:buyer.tax_id,buyer_phone:buyer.phone,tickets,coupon_code:appliedCoupon?.code||null,expected_subtotal_cents:subtotal()});
      if(!response?.checkout_url)throw Error('O pagamento não retornou um link. Tente novamente.');
      location.assign(response.checkout_url);
    }catch(err){error.textContent=err.message||'Não foi possível iniciar o pagamento.';submit.disabled=false;submit.textContent='Continuar para o Mercado Pago';}
  });
  initialize();
})();
