(() => {
  'use strict';
  const client=window.OnlySupabase;
  const $=s=>document.querySelector(s);
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rpc=(name,body={})=>client.rest(`rpc/${name}`,{method:'POST',body});
  const date=v=>new Date(v).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  const errorHtml=e=>`<p class="club-status club-error" role="alert">${safe(e.message||'Não foi possível carregar. Tente novamente.')} <button type="button" class="club-button club-secondary" data-club-retry>Tentar novamente</button></p>`;
  let accountName='';
  async function account(){
    const overview=$('[data-club-overview]'),loyalty=$('[data-club-loyalty]');
    if(!overview||!loyalty)return;
    try{
      const data=await rpc('customer_loyalty');
      const n=Number(data.events_count),discount=Number(data.discount_percent),next=(Math.floor(n/5)+1)*5,cycle=Math.floor(n/10)*10;
      const events=data.events||[];
      const eventList=events.length?`<div class="club-events">${events.map(e=>`<article class="club-event"><div><strong>${safe(e.name)}</strong><time>${safe(date(e.starts_at))}</time></div><b>Presença confirmada ✓</b></article>`).join('')}</div>`:'<p class="club-status">Sua história começa no próximo encontro. Após validar seu ingresso na entrada ou na Carona, sua presença aparece aqui.</p>';
      overview.innerHTML=`<header class="account-view-heading"><div><p class="eyebrow">Minha garagem de memórias</p><h1>Olá, ${safe(accountName)}.</h1><p>Os melhores momentos são os que a gente vive junto.</p></div></header><article class="club-hero"><span class="club-kicker">Only Crew · sua jornada</span><h2>Mais encontros.<br>Mais histórias pra contar.</h2><p>${n?`Você já esteve com a gente em ${n} evento${n===1?'':'s'}. Faltam ${next-n} para o próximo marco.`:'Seu primeiro check-in abre o caminho para brindes e descontos exclusivos.'}</p><button type="button" class="club-button" data-account-go="loyalty">Ver minha fidelidade <span aria-hidden="true">↗</span></button></article><div class="club-stats"><article class="club-stat"><span>Eventos que participei</span><strong>${n}</strong><small>presenças confirmadas</small></article><article class="club-stat"><span>Meu desconto</span><strong>${discount}%</strong><small>${discount===30?'permanente nos ingressos':'nos próximos ingressos'}</small></article><article class="club-stat"><span>Próximo marco</span><strong>${next}</strong><small>faltam ${next-n} eventos</small></article></div><section class="club-section"><h2>Eventos que participei</h2>${eventList}</section><a class="club-button club-secondary" href="eventos.html">Encontrar o próximo rolê</a>`;
      loyalty.innerHTML=`<article class="club-hero"><span class="club-kicker">Presença que vira recompensa</span><strong class="club-big">${String(n).padStart(2,'0')}</strong><p>eventos na sua história · ${discount}% de desconto ${discount===30?'permanente':''}</p></article><section class="club-section"><h2>Próxima parada: ${next} eventos.</h2><p class="club-note">Faltam ${next-n} presenças para ${next%10===0?'mais uma oversized e um moletom':'mais uma camiseta oversized'}.</p><progress class="club-progress" max="10" value="${n-cycle}" aria-label="Progresso neste ciclo de dez eventos"></progress><ol class="club-timeline">${Array.from({length:10},(_,i)=>{const milestone=cycle+i+1;return `<li class="${milestone<=n?'earned ':''}${milestone%5===0?'milestone':''}"><b>${milestone<=n?'✓':milestone}</b><span>${milestone%10===0?'Moletom':milestone%5===0?'Oversized':`${milestone}º`}</span></li>`;}).join('')}</ol></section><div class="club-rewards"><article class="club-reward"><span class="club-kicker">A cada 5 eventos</span><strong>Uma oversized do Only.</strong><p>Ao chegar no 5º evento, você também libera 20% nos próximos ingressos, até alcançar o 10º.</p><b>${data.shirts_earned} camiseta(s) conquistada(s)</b></article><article class="club-reward"><span class="club-kicker">A cada 10 eventos</span><strong>Um moletom pra chamar de seu.</strong><p>No 10º evento, seu desconto sobe para 30% e fica permanente. Os brindes continuam a cada novo marco.</p><b>${data.hoodies_earned} moletom(ns) conquistado(s)</b></article></div><p class="club-note">No 10º, 20º e demais múltiplos de 10, os dois brindes se acumulam. O desconto de fidelidade é automático no pagamento; com cupom, vale o maior desconto, sem somar os dois. Cada evento conta uma vez por conta, mesmo com vários ingressos ou reentradas. Reservas sem presença e ingressos cancelados não contam.</p>${n>=5?'<a class="club-button" href="https://ig.me/m/onlycars.club" target="_blank" rel="noopener noreferrer">Combinar a retirada dos meus brindes ↗</a><p class="club-note">As quantidades mostram brindes conquistados ao longo da sua jornada. A equipe confirma os que já foram entregues.</p>':''}`;
    }catch(e){overview.innerHTML=errorHtml(e);loyalty.innerHTML=errorHtml(e);}
  }
  let offset=0,total=0,requestId=0;
  async function users(){
    const list=$('[data-club-users]'),status=$('[data-club-users-status]');if(!list)return;
    const id=++requestId;
    status.textContent='Carregando usuários…';
    try{
      const result=await rpc('owner_list_users',{p_search:$('[data-club-user-search]').value,p_offset:offset});
      if(id!==requestId)return;
      total=result.total;status.textContent=`${total} usuário(s) · página ${Math.floor(offset/30)+1}`;
      list.innerHTML=result.users.length?result.users.map(u=>`<article class="club-user"><div><strong>${safe(u.display_name||'Sem nome cadastrado')}</strong><span>${safe(u.email)}</span><span>${u.is_owner?'Proprietário':u.role==='admin'?'Administrador':'Participante'} · cadastro em ${safe(date(u.created_at))}</span></div>${u.is_owner?'<b>Conta protegida</b>':`<button type="button" data-club-role-user="${safe(u.id)}" data-grant-admin="${u.role!=='admin'}">${u.role==='admin'?'Remover acesso de admin':'Dar acesso de admin'}</button>`}</article>`).join(''):'<p class="club-status">Nenhum usuário encontrado.</p>';
      $('[data-club-users-prev]').disabled=offset===0;$('[data-club-users-next]').disabled=offset+30>=total;
    }catch(e){if(id!==requestId)return;status.textContent=e.message;list.innerHTML=errorHtml(e);}
  }
  async function ranking(){
    const root=$('[data-club-ranking]');if(!root)return;root.innerHTML='<p class="club-status" role="status">Conferindo as presenças…</p>';
    try{const rows=await rpc('admin_loyalty_ranking');root.innerHTML=rows.length?`<div class="club-table-wrap"><table class="club-table"><caption>Até 200 participantes com presenças confirmadas</caption><thead><tr><th>Posição</th><th>Participante</th><th>Eventos</th><th>Desconto</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.position}º</td><td>${safe(r.display_name||'Participante')}</td><td>${r.events_count}</td><td>${r.discount_percent}%</td></tr>`).join('')}</tbody></table></div>`:'<p class="club-status">O grid ainda está vazio. O ranking aparece quando as primeiras presenças forem confirmadas.</p>';}catch(e){root.innerHTML=errorHtml(e);}
  }
  document.addEventListener('only:account-ready',e=>{accountName=(e.detail.user.email||'Only Crew').split('@')[0];accountName=$('[data-account-greeting]')?.textContent||accountName;account();});
  document.addEventListener('only:admin-ready',async()=>{
    ranking();
    try{if(await rpc('is_club_owner')!==true)return;$('[data-owner-only]').hidden=false;users();}catch(_){}
  });
  let timer;
  document.addEventListener('input',e=>{if(e.target.matches('[data-club-user-search]')){clearTimeout(timer);++requestId;timer=setTimeout(()=>{offset=0;users();},250);}});
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-club-ranking-refresh]'))ranking();
    if(e.target.closest('[data-club-users-prev]')){offset=Math.max(0,offset-30);users();}
    if(e.target.closest('[data-club-users-next]')&&offset+30<total){offset+=30;users();}
    const retry=e.target.closest('[data-club-retry]');if(retry){if(retry.closest('[data-club-ranking]'))ranking();else if(retry.closest('[data-club-users]'))users();else account();}
    const button=e.target.closest('[data-club-role-user]');if(!button)return;
    button.disabled=true;const grant=button.dataset.grantAdmin==='true';
    try{await rpc('owner_set_admin',{p_user_id:button.dataset.clubRoleUser,p_admin:grant});await users();$('[data-club-users-status]').textContent=grant?'Acesso de administrador concedido.':'Acesso de administrador removido.';}catch(error){$('[data-club-users-status]').textContent=error.message;button.disabled=false;}
  });
})();
