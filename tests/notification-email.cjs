const {readFileSync}=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path').join(__dirname,'../supabase/functions/process-only-emails/index.ts');
const source=stripTypeScriptTypes(readFileSync(path,'utf8').replace(/^import .*;\n/gm,''));
async function run(template,{optedOut=false,prefError=false,claimStatus='sending',unread=3}={}){
 let handler,send=[],updates=[];
 const row={id:1,template,recipient_email:'test@example.invalid',subject:'test',attempts:0,payload:{days:10,qr_token:'test',ticket_code:'TEST'}};
 const db={rpc:async(name)=>name==='notification_digest_status'?{data:{unread_count:unread,batch_unread_count:unread}}:name==='only_email_preference'?{data:prefError?null:[{unsubscribe_token:'00000000-0000-4000-8000-000000000001',unsubscribed_at:optedOut?'2026-10-13':null}],error:prefError?{}:null}:{data:true},from:()=>{
 let update;
 const q={select:()=>q,in:()=>q,lte:()=>q,lt:()=>q,order:()=>q,eq:()=>q,limit:async()=>({data:[row]}),update:x=>{update=x;updates.push(x);return q},maybeSingle:async()=>({data:{status:claimStatus}}),then:(a,b)=>Promise.resolve({data:null}).then(a,b)};
 return q;
 }};
 vm.runInNewContext(source,{Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',RESEND_API_KEY:'resend'})[k]}},createClient:()=>db,QRCode:{toDataURL:async()=> 'data:image/png;base64,test'},Response,fetch:async(url,init)=>{send.push(JSON.parse(init.body));return Response.json({id:'test'})}});
 await handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer service','Content-Type':'application/json'},body:'{}'}));
 return {send,updates};
}
(async()=>{
for(const template of ['notification_digest','event_countdown','checkout_recovery','ticket_photo_reminder']){
 const {send}=await run(template);assert.equal(send.length,1);assert.match(send[0].html,/Não quero receber estes lembretes/);assert.match(send[0].headers['List-Unsubscribe'],/unsubscribe-only-emails/);assert.equal(send[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal((await run(template,{optedOut:true})).send.length,0);
 assert.equal((await run(template,{prefError:true})).send.length,0);
 assert.equal((await run(template,{claimStatus:'suppressed'})).send.length,0);
}
for(const template of ['ticket_purchase','order_purchase']){
 const {send}=await run(template,{optedOut:true});assert.equal(send.length,1);assert.equal(send[0].headers,undefined);assert.doesNotMatch(send[0].html,/Não quero receber estes lembretes/);
}
assert.equal((await run('notification_digest',{unread:2})).send.length,0);
const digest=(await run('notification_digest')).send[0];assert.match(digest.html,/Você tem 3 notificações não lidas/);assert.match(digest.html,/minha-conta.html\?notifications=1/);
stripTypeScriptTypes(readFileSync(path.replace('process-only-emails','unsubscribe-only-emails'),'utf8'));
console.log('PASS: optional footer/headers, opted-out blocking, fail-closed preference, suppressed claim, essential delivery and TypeScript parsing. No emails sent.');

})().catch(e=>{console.error(e);process.exit(1)});
