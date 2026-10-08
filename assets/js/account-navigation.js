(() => {
 const init=()=>{
  const page=document.body.dataset.page;if(!['conta','admin'].includes(page))return;
  const header=document.querySelector('.header'),nav=document.querySelector(page==='admin'?'.admin-tabs':'.account-sidebar'),content=document.querySelector(page==='admin'?'[data-admin-content]':'[data-account-content]');
  if(!header||!nav||!content)return;
  document.body.classList.add('only-drawer-layout');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='only-menu-toggle';toggle.hidden=true;toggle.setAttribute('aria-label','Abrir menu');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','only-account-menu');toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';header.append(toggle);
  const drawer=document.createElement('dialog');drawer.id='only-account-menu';drawer.className='only-menu-drawer';drawer.setAttribute('aria-label',page==='admin'?'Menu administrativo':'Menu da conta');drawer.innerHTML='<header><strong>Acesso rápido</strong><button type="button" aria-label="Fechar menu" data-close-menu>×</button></header>';
  document.body.append(drawer);drawer.append(nav);
  if(page==='conta'){
   const home=document.querySelector('.account-back-home'),admin=document.querySelector('.account-header-admin');
   if(home){home.className='only-drawer-link';drawer.append(home);}
   if(admin){admin.className='only-drawer-link only-drawer-admin';drawer.append(admin);}
  }
  const sync=()=>{toggle.hidden=content.hidden;if(content.hidden&&drawer.open)drawer.close();};new MutationObserver(sync).observe(content,{attributes:true,attributeFilter:['hidden']});sync();
  toggle.onclick=()=>{document.querySelector('.only-notifications')?.setAttribute('hidden','');document.querySelector('.only-notification-bell')?.setAttribute('aria-expanded','false');drawer.showModal();document.body.classList.add('only-menu-open');toggle.setAttribute('aria-expanded','true');};
  drawer.querySelector('[data-close-menu]').onclick=()=>drawer.close();
  drawer.addEventListener('close',()=>{document.body.classList.remove('only-menu-open');toggle.setAttribute('aria-expanded','false');toggle.focus();});
  drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close();}if(e.target.closest('[data-admin-tab],[data-account-tab],a'))drawer.close();});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
