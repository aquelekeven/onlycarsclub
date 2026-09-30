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
      const totalEvents=Number(data.events_count),n=Number(data.cycle_events_count??data.events_count),discount=Number(data.discount_percent),next=n<5?5:10;
      const events=data.events||[];
      const eventList=events.length?`<div class="club-events">${events.map(e=>`<article class="club-event"><div><strong>${safe(e.name)}</strong><time>${safe(date(e.starts_at))}</time></div><b>Presença confirmada ✓</b></article>`).join('')}</div>`:'<p class="club-status">Sua história começa no próximo encontro. Após validar seu ingresso na entrada ou na Carona, sua presença aparece aqui.</p>';
      overview.innerHTML=`<header class="account-view-heading"><div><p class="eyebrow">Minha garagem de memórias</p><h1>Olá, ${safe(accountName)}.</h1><p>Os melhores momentos são os que a gente vive junto.</p></div></header><article class="club-hero"><span class="club-kicker">Only Crew · sua jornada</span><h2>Mais encontros.<br>Mais histórias pra contar.</h2><p>${n?`Você tem ${n} presença(s) neste ciclo. ${n>=10?'Bônus de 40% liberado para o próximo ingresso.':`Faltam ${next-n} para o próximo marco.`}`:'Seu primeiro check-in abre o caminho para brindes e descontos exclusivos.'}</p><button type="button" class="club-button" data-account-go="loyalty">Ver minha fidelidade <span aria-hidden="true">↗</span></button></article><div class="club-stats"><article class="club-stat"><span>Eventos que participei</span><strong>${totalEvents}</strong><small>presenças confirmadas</small></article><article class="club-stat"><span>Meu desconto</span><strong>${discount}%</strong><small>1 ingresso por evento</small></article><article class="club-stat"><span>Próximo marco</span><strong>${next}</strong><small>${n>=10?'ciclo completo':`faltam ${next-n} eventos`}</small></article></div><section class="club-section"><h2>Eventos que participei</h2>${eventList}</section><a class="club-button club-secondary" href="eventos.html">Encontrar o próximo rolê</a>`;
      loyalty.innerHTML=window.OnlyClubView.loyalty(data);
    }catch(e){overview.innerHTML=errorHtml(e);loyalty.innerHTML=errorHtml(e);}
  }
  let offset=0,total=0,requestId=0;
  async function users(){
    const list=$('[data-club-users]'),status=$('[data-club-users-status]');if(!list)return;
    const id=++requestId;
    status.textContent='Carregando usuários…';
    try{
      const result=await rpc('owner_user_directory',{p_search:$('[data-club-user-search]').value,p_offset:offset,p_sort:$('[data-club-user-sort]').value});
      if(id!==requestId)return;
      total=result.total;status.textContent=`${total} usuário(s) · página ${Math.floor(offset/30)+1}`;
      const userCard=u=>`<article class="club-user"><div><strong>${safe(u.display_name||'Sem nome cadastrado')}</strong><span>${safe(u.email)}</span><span>${u.is_owner?'Proprietário':u.role==='admin'?'Administrador':u.role==='gate'?'Portaria':'Participante'} · cadastro em ${safe(date(u.created_at))}</span></div>${u.is_owner?'<b>Conta protegida</b>':`<div class="club-role-controls"><label>Cargo<select data-club-role-select="${safe(u.id)}" aria-label="Cargo de ${safe(u.display_name||u.email)}">${[['customer','Participante'],['gate','Portaria'],['admin','Administrador']].map(([value,label])=>`<option value="${value}" ${u.role===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" data-club-role-user="${safe(u.id)}">Salvar cargo</button></div>`}</article>`;
      list.innerHTML=result.users.length?result.users.map(userCard).join(''):'<p class="club-status">Nenhum usuário encontrado.</p>';
      $('[data-club-admins]').innerHTML=result.admins.length?result.admins.map(userCard).join(''):'<p>Nenhum administrador corresponde à busca.</p>';
      $('[data-club-users-prev]').disabled=offset===0;$('[data-club-users-next]').disabled=offset+30>=total;
    }catch(e){if(id!==requestId)return;status.textContent=e.message;list.innerHTML=errorHtml(e);$('[data-club-admins]').innerHTML='';}
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
  document.addEventListener('change',e=>{if(e.target.matches('[data-club-user-sort]')){offset=0;users();}});
  let timer;
  document.addEventListener('input',e=>{if(e.target.matches('[data-club-user-search]')){clearTimeout(timer);++requestId;timer=setTimeout(()=>{offset=0;users();},250);}});
  document.addEventListener('click',async e=>{
    if(e.target.closest('[data-club-ranking-refresh]'))ranking();
    if(e.target.closest('[data-club-users-prev]')){offset=Math.max(0,offset-30);users();}
    if(e.target.closest('[data-club-users-next]')&&offset+30<total){offset+=30;users();}
    const retry=e.target.closest('[data-club-retry]');if(retry){if(retry.closest('[data-club-ranking]'))ranking();else if(retry.closest('[data-club-users]'))users();else account();}
    const button=e.target.closest('[data-club-role-user]');if(!button)return;
    document.querySelectorAll(`[data-club-role-user="${button.dataset.clubRoleUser}"]`).forEach(b=>b.disabled=true);const role=button.closest('.club-user').querySelector('[data-club-role-select]').value;
    try{await rpc('owner_set_user_role',{p_user_id:button.dataset.clubRoleUser,p_role:role});await users();$('[data-club-users-status]').textContent=`Cargo atualizado para ${{customer:'Participante',gate:'Portaria',admin:'Administrador'}[role]}.`;}catch(error){$('[data-club-users-status]').textContent=error.message;document.querySelectorAll(`[data-club-role-user="${button.dataset.clubRoleUser}"]`).forEach(b=>b.disabled=false);}
  });
})();
