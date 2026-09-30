const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/js/supabase-client.js'), 'utf8');
const key = 'onlycars.supabase.session';
function setup(fetch) {
  const values = new Map();
  const localStorage = {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const context = {localStorage,fetch,navigator:{},window:{},setTimeout,URL,URLSearchParams};
  vm.runInNewContext(source,context);
  const session = {access_token:'old',refresh_token:'refresh-old',expires_at:1};
  localStorage.setItem(key,JSON.stringify(session));
  return {client:context.window.OnlySupabase,localStorage};
}
const response = (data,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
(async()=>{
  let requests=0;
  let resolve;
  const pending=new Promise(r=>resolve=r);
  const one=setup(async()=>{requests++;await pending;return response({access_token:'new',refresh_token:'refresh-new',expires_in:3600});});
  const reads=Array.from({length:10},()=>one.client.getSession());
  resolve();
  const sessions=await Promise.all(reads);
  assert.equal(requests,1,'concurrent callers must share one refresh');
  assert(sessions.every(s=>s.access_token==='new'));
  const outage=setup(async()=>{throw new TypeError('Network unavailable');});
  await assert.rejects(outage.client.getSession());
  assert(outage.localStorage.getItem(key),'network failure must preserve session');
  const expired=setup(async()=>response({error_code:'refresh_token_not_found',message:'Expired'},400));
  await assert.rejects(expired.client.getSession());
  assert.equal(expired.localStorage.getItem(key),null,'revoked refresh must be cleared');
  let finish;
  const logout=setup(async()=>{await new Promise(r=>finish=r);return response({access_token:'new',refresh_token:'new-r',expires_in:3600});});
  const refresh=logout.client.getSession();
  logout.localStorage.removeItem(key);finish();
  assert.equal(await refresh,null,'refresh must not resurrect a logged-out session');
  let releaseUser;
  const userRace=setup(async url=>{
    if(url.endsWith('/auth/v1/user')) { await new Promise(r=>releaseUser=r); return response({id:'user'}); }
    return response({access_token:'new',refresh_token:'refresh-new',expires_in:3600});
  });
  userRace.localStorage.setItem(key,JSON.stringify({access_token:'valid-old',refresh_token:'r',expires_at:Date.now()/1000+3600}));
  const user=userRace.client.getUser();await new Promise(r=>setTimeout(r,0));
  userRace.localStorage.setItem(key,JSON.stringify({access_token:'newer',refresh_token:'newer-r',expires_at:Date.now()/1000+3600}));
  releaseUser();await user;
  assert.equal(JSON.parse(userRace.localStorage.getItem(key)).access_token,'newer','late getUser must not overwrite refreshed credentials');
  console.log('PASS: concurrent refresh, network failure, revoked session, sign-out race, stale getUser response');
})().catch(error=>{console.error(error);process.exit(1);});
