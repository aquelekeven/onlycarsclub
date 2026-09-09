const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const context={window:{},Intl,URLSearchParams,Date};vm.runInNewContext(fs.readFileSync('assets/js/ticket-options.js','utf8'),context);
const model=context.window.OnlyTicketOptions;
const event={status:'sales_open',sales_end_at:'2099-01-01',remaining_public:20,carona_sales_enabled:true,carona_price_cents:18000,combo_discount_percent:10,lots:[{id:'724abaac-80bd-4897-a142-42cacd01bdd9',name:'Lote 1',active:true,price_cents:3500,capacity:30,sold_or_reserved:12}]};
const catalog=model.catalog(event);
assert.equal(catalog.prices.combo,19350);assert.equal(model.total({expo:1,carona:1,combo:1},catalog.prices),40850);
assert.equal(model.catalog({...event,lots:[{...event.lots[0],price_cents:4500}]}).prices.combo,20250);
assert.equal(model.catalog({...event,lots:[{...event.lots[0],price_cents:6000}]}).prices.combo,21600);
assert.equal(model.catalog({...event,lots:[]}).enabled.carona,true);assert.equal(model.catalog({...event,lots:[]}).enabled.combo,false);
assert.equal(model.catalog({...event,remaining_public:0}).enabled.expo,false);
assert.equal(model.catalog({...event,sales_end_at:'2000-01-01'}).enabled.carona,false);
assert.equal(model.selection('?expo=-5&carona=abc&combo=999').combo,10);assert.equal(model.selection('?expo=-5').expo,0);
assert.match(model.validate({expo:10,carona:1,combo:0},catalog),/10/);
assert.match(model.validate({expo:1,carona:0,combo:1},{...catalog,expoRemaining:1}),/vagas/);
// User interaction: quantities, refresh, login forwarding and connection recovery.
async function testEventPage(){
 const elements=new Map();
 function el(key){if(!elements.has(key))elements.set(key,{textContent:'',dataset:{},disabled:false,classList:{toggle(){}},addEventListener(_,fn){this.click=fn}});return elements.get(key);}
 const buttons=[];for(const kind of model.kinds)for(const delta of [-1,1]){const b=el(kind+delta);b.dataset={quantityKind:kind,quantityDelta:String(delta)};buttons.push(b);}
 const root={dataset:{eventSlug:'only-cars-meeting-2026'},querySelector:el,querySelectorAll:selector=>selector==='[data-quantity-kind]'?buttons:buttons.filter(b=>selector.includes(`"${b.dataset.quantityKind}"`))};
 let fail=false;
 const ctx={window:{OnlyTicketOptions:model,OnlySupabase:{publicRest:async()=>{if(fail)throw Error();return event;},getSession:async()=>null}},document:{querySelector:()=>root},URLSearchParams,Number,sessionStorage:{setItem(k,v){this[k]=v}},location:{}};
 vm.runInNewContext(fs.readFileSync('assets/js/event.js','utf8'),ctx);await new Promise(setImmediate);
 el('expo1').click();el('combo1').click();assert.equal(el('[data-selection-total]').textContent,model.money(22850));
 await el('[data-event-buy]').click();assert.equal(ctx.location.href,'login.html?next=ingresso');assert.match(ctx.sessionStorage['onlycars.afterLogin'],/expo=1&carona=0&combo=1/);
 fail=true;await el('[data-event-buy]').click();assert.equal(el('[data-event-buy]').textContent,'Tentar novamente');
 fail=false;await el('[data-event-buy]').click();assert.equal(el('[data-event-buy]').disabled,false);
}
// Edge payment glue: auth must precede reservation and server total determines payment.
async function edgeScenario({authenticated=true,rpcError=false,mpError=false}={}){
 let handler;const calls=[];let cleanup=0;
 const query=(table)=>({select(){return this},eq(){return this},single:async()=>({data:table==='profiles'?{birth_date:'1990-01-01'}:{id:'event',name:'Only Cars Meeting',status:'sales_open',sales_end_at:'2099-01-01'}}),update(){return {eq:async()=>({error:null})}},delete(){cleanup++;return {eq:async()=>({error:null})}}});
 const client={auth:{getUser:async()=>({data:{user:authenticated?{id:'user',email:'qa@example.invalid'}:null},error:null})},from:query,rpc:async(name,args)=>{calls.push({name,args});return rpcError?{error:{message:'Preço alterado'}}:{data:{order_id:'order',total_cents:19350,ticket_count:1,event_name:'Only Cars Meeting'}}}};
 let payment;
 const ctx={Deno:{env:{get:()=> 'test-only'},serve:fn=>handler=fn},createClient:()=>client,Response,Request,console:{log(){},error(){}},fetch:async(_,req)=>{payment=JSON.parse(req.body);return new Response(JSON.stringify(mpError?{message:'Recusado'}:{id:'preference',init_point:'https://mercadopago.example/checkout'}),{status:mpError?400:200});}};
 const ts=fs.readFileSync('supabase/functions/mercado-pago-ingresso/index.ts','utf8').replace(/^import .*\n/,'');vm.runInNewContext(stripTypeScriptTypes(ts),ctx);
 const response=await handler(new Request('https://edge.example',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({event_slug:'only-cars-meeting-2026',lot_id:event.lots[0].id,buyer_name:'QA',buyer_tax_id:'00000000000',buyer_phone:'11999999999',expected_subtotal_cents:19350,tickets:[{ticket_kind:'combo',vehicle_plate:'QAT0A01',vehicle_make:'QA',vehicle_model:'TEST',price_cents:1}]})}));
 return {response,data:await response.json(),calls,payment,cleanup};
}
(async()=>{
 await testEventPage();
 let r=await edgeScenario();assert.equal(r.response.status,200);assert.equal(r.payment.items[0].unit_price,193.5);assert.equal(r.calls[0].args.p_tickets[0].price_cents,undefined);assert.equal(r.calls[0].args.p_tickets[0].ticket_kind,'combo');
 r=await edgeScenario({authenticated:false});assert.equal(r.response.status,401);assert.equal(r.calls.length,0);assert.equal(r.payment,undefined);
 r=await edgeScenario({rpcError:true});assert.equal(r.response.status,400);assert.equal(r.payment,undefined);
 r=await edgeScenario({mpError:true});assert.equal(r.response.status,400);assert.equal(r.cleanup,2);
 console.log('PASS: pricing for all lots, mixed quantities, limits, unavailable modes, stepper interaction, retry, login selection, authenticated checkout, server pricing and payment failure cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
