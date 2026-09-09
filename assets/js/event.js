(function () {
  'use strict';
  const root=document.querySelector('[data-event-page]');
  const client=window.OnlySupabase, model=window.OnlyTicketOptions;
  if(!root || !model) return;
  const selected={expo:0,carona:0,combo:0};
  const buy=root.querySelector('[data-event-buy]');
  const status=root.querySelector('[data-event-status]');
  let catalog=null, retry=false;
  function render() {
    const count=model.count(selected);
    model.kinds.forEach(kind=>{
      root.querySelector(`[data-option-quantity="${kind}"]`).textContent=selected[kind];
      root.querySelector(`[data-ticket-option="${kind}"]`).classList.toggle('is-selected',selected[kind]>0);
      root.querySelector(`[data-option-price="${kind}"]`).textContent=catalog ? ((kind==='expo'||kind==='combo')&&!catalog.lot ? 'Indisponível' : model.money(catalog.prices[kind])) : '—';
      root.querySelector(`[data-option-status="${kind}"]`).textContent=!catalog ? 'Disponibilidade não confirmada' : !catalog.enabled[kind] ? 'Indisponível no momento' : kind==='carona' ? 'Ingresso individual' : catalog.lot.name;
      root.querySelectorAll(`[data-quantity-kind="${kind}"]`).forEach(button=>{
        const delta=Number(button.dataset.quantityDelta);
        button.disabled=delta<0 ? selected[kind]===0 : !catalog?.enabled[kind] || count>=model.limit || (kind!=='carona' && selected.expo+selected.combo>=catalog.expoRemaining);
      });
    });
    root.querySelector('[data-selection-count]').textContent=count ? `${count} ${count===1?'ingresso selecionado':'ingressos selecionados'}`:'Nenhum ingresso selecionado';
    root.querySelector('[data-selection-total]').textContent=model.money(catalog?model.total(selected,catalog.prices):0);
    buy.disabled=!retry && (!catalog || !!model.validate(selected,catalog));
    buy.textContent=retry?'Tentar novamente':count?'Continuar compra':'Selecione um ingresso';
    if(!retry) status.textContent=count && catalog ? model.validate(selected,catalog) : '';
  }
  async function load(){
    retry=false;buy.disabled=true;status.textContent='Consultando disponibilidade…';
    try{
      if(!client) throw Error();
      const event=await client.publicRest('rpc/public_event_summary',{method:'POST',body:{target_slug:root.dataset.eventSlug}});
      if(!event) throw Error();
      catalog=model.catalog(event);
    }catch(_){catalog=null;retry=true;status.textContent='Não foi possível consultar os ingressos. Tente novamente.';}
    render();
  }
  root.querySelectorAll('[data-quantity-kind]').forEach(button=>button.addEventListener('click',()=>{
    if(button.disabled) return;
    selected[button.dataset.quantityKind]+=Number(button.dataset.quantityDelta);render();
  }));
  buy.addEventListener('click',async()=>{
    if(retry){await load();return;}
    if(!catalog || model.validate(selected,catalog))return;
    buy.disabled=true;buy.textContent='Conferindo ingressos…';
    const oldTotal=model.total(selected,catalog.prices);
    await load();
    if(!catalog || model.validate(selected,catalog))return;
    if(oldTotal!==model.total(selected,catalog.prices)){status.textContent='O lote mudou. Confira o novo total e clique em continuar.';return;}
    const params=new URLSearchParams({event:root.dataset.eventSlug,...selected});
    const destination=`ingresso.html?${params}`;
    const session=await client.getSession().catch(()=>null);
    if(!session){try{sessionStorage.setItem('onlycars.afterLogin',destination);}catch(_){}location.href=`login.html?next=${encodeURIComponent(destination)}`;}
    else location.href=destination;
  });
  load();
})();
