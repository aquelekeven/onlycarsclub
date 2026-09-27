// NODE_PATH must include playwright. All Supabase traffic is mocked; no live users are modified.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const content=fs.readFileSync(file);const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime});res.end(content);}catch{res.writeHead(404).end();}
});
let browser;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const state={admin:false,owner:false,count:5,requests:[],roleChanges:0,sorts:[]};
 const user={id:'00000000-0000-4000-8000-000000000001',email:'qa@example.invalid'};
 await context.addInitScript(user=>localStorage.setItem('onlycars.supabase.session',JSON.stringify({access_token:'mock',refresh_token:'mock',expires_at:Math.floor(Date.now()/1000)+3600,user})),user);
 await context.route('https://wxxgcnyolpioyiaepkvs.supabase.co/**',route=>{
  const url=new URL(route.request().url());state.requests.push(url.pathname);
  let body=[];
  if(url.pathname.includes('/auth/v1/user'))body=user;
  else if(url.pathname.endsWith('/profiles'))body=[{...user,role:state.admin?'admin':'customer',display_name:'Pessoa do Only',phone:'11999999999',tax_id:'12345678901',birth_date:'1990-01-01'}];
  else if(url.pathname.endsWith('/is_admin'))body=state.admin;
  else if(url.pathname.endsWith('/is_club_owner'))body=state.owner;
  else if((url.pathname.endsWith('/customer_loyalty')||url.pathname.endsWith('/customer_event_loyalty')))body={events_count:state.count,cycle_events_count:state.count,discount_percent:state.count>=10?40:state.count>=5?30:state.count*5,shirts_earned:Math.floor(state.count/5),hoodies_earned:Math.floor(state.count/10),events:Array.from({length:state.count},(_,i)=>({id:String(i),name:`Only Meeting ${i+1}`,starts_at:'2026-08-01T10:00:00Z'}))};
  else if(url.pathname.endsWith('/owner_user_directory')){state.sorts.push(route.request().postDataJSON().p_sort);const users=[{id:user.id,email:user.email,display_name:'Proprietário',role:'admin',is_owner:true,created_at:'2026-01-01'},{id:'00000000-0000-4000-8000-000000000002',email:'participante@example.invalid',display_name:'Participante <teste>',role:state.roleChanges?'admin':'customer',created_at:'2026-01-02'}];body={total:2,users,admins:users.filter(u=>u.role==='admin')};}
  else if(url.pathname.endsWith('/owner_set_admin')){state.roleChanges++;body=null;}
  else if(url.pathname.endsWith('/admin_loyalty_ranking'))body=[{position:1,display_name:'Pessoa do Only',events_count:10,discount_percent:30}];
  else if(url.pathname.endsWith('/public_event_summary'))body={id:'00000000-0000-4000-8000-000000000003',name:'Only Meeting',status:'sales_open',sales_end_at:'2099-01-01',remaining_public:20,carona_sales_enabled:true,carona_price_cents:18000,combo_discount_percent:10,lots:[{id:'00000000-0000-4000-8000-000000000004',name:'Lote 1',active:true,price_cents:3500,capacity:30,sold_or_reserved:0}]};
  else if(url.pathname.endsWith('/preview_ticket_purchase_coupon'))body={code:'TESTE',discount_cents:350,payable_cents:3150};
  return route.fulfill({json:body});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const name of ['loja','produto','carrinho','entrega','pagamento']){
  await page.goto(`${base}/${name}.html`);await page.locator('[data-store-placeholder]').waitFor();
  assert.equal(await page.locator('main:visible').count(),1);assert.equal(await page.locator('.cart-shortcut:visible').count(),0);
  assert.equal(await page.locator('a[href="https://ig.me/m/onlycars.club"]').count(),1);
 }
 await page.screenshot({path:path.join(root,'../club-store.png'),fullPage:true,animations:'disabled'});
 await page.goto(`${base}/minha-conta.html`);await page.locator('[data-club-overview] .club-hero').waitFor();
 assert.equal(await page.locator('[data-account-tab="orders"]:visible').count(),0);assert.equal(await page.locator('[data-account-tab="address"]:visible').count(),0);
 assert.equal(state.requests.some(p=>/\/(addresses|orders)$/.test(p)),false);
 await page.locator('[data-account-tab="loyalty"]').click();await page.locator('[data-club-loyalty] .club-hero').waitFor();
 assert.match(await page.locator('[data-club-loyalty] .club-hero').innerText(),/30%/);
 assert.equal(await page.locator('.club-timeline .club-reward-icon').count(),2);
 assert.equal(await page.locator('.club-timeline .club-reward-icon').first().evaluate(e=>getComputedStyle(e).fill),'rgb(255, 212, 31)');
 assert.match(await page.locator('.club-rule').innerText(),/1 ingresso por conta, por evento/);
 await page.screenshot({path:path.join(root,'../club-loyalty-desktop.png'),fullPage:true,animations:'disabled'});
 for(const count of [0,4,5,9,10,15,20]){
  state.count=count;await page.reload();await page.locator('[data-club-overview] .club-hero').waitFor();await page.locator('[data-account-tab="loyalty"]').click();
  assert.match(await page.locator('[data-club-loyalty] .club-hero').innerText(),new RegExp(`${count>=10?40:count>=5?30:count*5}%`));
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'../club-loyalty-mobile.png'),fullPage:true,animations:'disabled'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 state.admin=true;state.owner=true;await page.goto(`${base}/admin.html`);await page.locator('[data-owner-only]:visible').waitFor();await page.locator('[data-admin-tab="users"]').click();await page.locator('[data-club-role-user]').waitFor();
 assert.equal(await page.locator('[data-club-role-user]').count(),1);await page.locator('[data-club-role-user]').click();await page.getByText('Acesso de administrador concedido.',{exact:true}).waitFor();assert.equal(state.roleChanges,1);
 assert.equal(await page.locator('[data-club-admins] .club-user').count(),2);assert.equal(await page.locator('[data-club-users] .club-user').count(),2);
 await page.locator('[data-club-user-sort]').selectOption('name_asc');await page.waitForResponse(r=>r.url().endsWith('/owner_user_directory'));assert.equal(state.sorts.at(-1),'name_asc');
 await page.screenshot({path:path.join(root,'../club-admin-mobile.png'),fullPage:true,animations:'disabled'});
 state.owner=false;await page.reload();await page.locator('[data-admin-content]:visible').waitFor();assert.equal(await page.locator('[data-owner-only]:visible').count(),0);
 await page.locator('[data-admin-tab="loyalty"]').click();await page.locator('.club-table').waitFor();
 state.count=10;await page.goto(`${base}/ingresso.html?expo=1`);await page.locator('[data-ticket-submit]:enabled').waitFor();
 assert.match(await page.locator('[data-ticket-total]').innerText(),/21,00/);
 await page.locator('[data-ticket-coupon-code]').fill('TESTE');await page.locator('[data-ticket-coupon-apply]').click();await page.getByText('Sua fidelidade oferece o maior desconto e será aplicada automaticamente.').waitFor();
 assert.match(await page.locator('[data-ticket-total]').innerText(),/21,00/);
 await page.goto(`${base}/ingresso.html?carona=2`);await page.locator('[data-ticket-submit]:enabled').waitFor();assert.match(await page.locator('[data-ticket-total]').innerText(),/288,00/);
 assert.deepEqual(errors,[]);
 // Verify the one-switch restoration before any storefront setup runs.
 await context.route('**/assets/js/club-config.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets/js/club-config.js'),'utf8').replace('storeEnabled: false','storeEnabled: true')}));
 await page.goto(`${base}/loja.html`);assert.equal(await page.locator('[data-store-placeholder]').count(),0);assert.equal(await page.locator('main:visible').count(),1);assert.equal(await page.locator('template[data-store-legacy]').count(),0);
 console.log('PASS: storefront pause/restore, account, milestones, mobile, owner management, admin ranking, checkout discount and coupon comparison.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
