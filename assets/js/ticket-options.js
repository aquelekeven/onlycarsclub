(function () {
  'use strict';
  const kinds = ['expo', 'carona', 'combo'];
  const names = { expo:'Expo · Veículo', carona:'Carona Radical', combo:'Expo + Carona Radical' };
  const limit = 10;
  const money = cents => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents / 100);
  function selection(search) {
    const params = new URLSearchParams(search);
    return Object.fromEntries(kinds.map(kind => {
      const raw = params.get(kind) || '0';
      return [kind, /^\d+$/.test(raw) ? Math.min(limit, Number(raw)) : 0];
    }));
  }
  function catalog(event) {
    const lot = event?.lots?.find(item => item.active);
    const open = event?.status === 'sales_open' && new Date(event.sales_end_at).getTime() > Date.now();
    const expoRemaining = lot ? Math.max(0, Math.min(Number(event.remaining_public), Number(lot.capacity) - Number(lot.sold_or_reserved))) : 0;
    const ride = Number(event?.carona_price_cents || 18000);
    const discount = Number(event?.combo_discount_percent ?? 10);
    const expo = Number(lot?.price_cents || 0);
    return {lot, expoRemaining, open, prices:{expo,carona:ride,combo:Math.round((expo+ride)*(100-discount)/100)},
      enabled:{expo:open && expoRemaining>0,carona:open && event?.carona_sales_enabled===true,combo:open && expoRemaining>0 && event?.carona_sales_enabled===true}};
  }
  const count = selection => kinds.reduce((n,kind)=>n+selection[kind],0);
  const total = (selection, prices) => kinds.reduce((n,kind)=>n+selection[kind]*prices[kind],0);
  function validate(selection, catalog) {
    if (!count(selection)) return 'Selecione pelo menos um ingresso.';
    if (count(selection)>limit) return `Escolha até ${limit} ingressos por pedido.`;
    if (kinds.some(kind => selection[kind] && !catalog.enabled[kind])) return 'Uma opção selecionada não está mais disponível. Revise os ingressos.';
    if (selection.expo+selection.combo>catalog.expoRemaining) return 'Não há vagas Expo suficientes neste lote. Reduza a quantidade.';
    return '';
  }
  window.OnlyTicketOptions = {kinds,names,limit,money,selection,catalog,count,total,validate};
})();
