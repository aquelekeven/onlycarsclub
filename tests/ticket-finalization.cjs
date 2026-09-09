// Run with Node and jsdom 26.1.0 available in NODE_PATH. All network/data operations are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const read = path => fs.readFileSync(path, 'utf8');
const tick = () => new Promise(setImmediate);
async function page(path, search = '') {
  const dom = new JSDOM(read(path), { url: `https://onlycarsclub.com.br/${path}${search}`, runScripts: 'outside-only' });
  await tick();
  return dom;
}
async function testLogin(next, saved, expected, blockedStorage = false) {
  const dom = await page('login.html', next ? `?next=${encodeURIComponent(next)}` : '');
  const w = dom.window, form = w.document.querySelector('[data-login-form]');
  for (const name of ['email', 'password']) Object.defineProperty(form, name, { value: form.elements.namedItem(name) });
  form.email.value = 'qa@example.invalid'; form.password.value = 'test-password';
  let signedIn = false, destination;
  w.OnlySupabase = { signIn: async () => { signedIn = true; }, consumeAuthRedirect: () => null };
  if (saved) w.sessionStorage.setItem('onlycars.afterLogin', saved);
  const storage = blockedStorage ? { getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')} } : w.sessionStorage;
  vm.runInNewContext(read('assets/js/auth.js'), { window: w, document: w.document, URL, URLSearchParams, sessionStorage: storage,
    location: { origin: w.location.origin, href: w.location.href, search: w.location.search, replace: value => destination = value } });
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick();
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.ok(signedIn); assert.equal(destination, expected);
  if (!blockedStorage) assert.equal(w.sessionStorage.getItem('onlycars.afterLogin'), null);
  dom.window.close();
}
const order = '10000000-0000-4000-8000-000000000000';
const fixtures = [
  { id: '20000000-0000-4000-8000-000000000001', order_id: order, ticket_code: 'EXPO1', ticket_kind: 'expo', ticket_status: 'active', vehicle_plate: 'AAA1A11' },
  { id: '20000000-0000-4000-8000-000000000002', order_id: order, ticket_code: 'RIDE1', ticket_kind: 'carona', ticket_status: 'active' },
  { id: '20000000-0000-4000-8000-000000000003', order_id: order, ticket_code: 'COMBO1', ticket_kind: 'combo', ticket_status: 'active', vehicle_plate: 'BBB2B22' },
  { id: '20000000-0000-4000-8000-000000000004', order_id: 'other', ticket_code: 'OTHER', ticket_kind: 'expo', ticket_status: 'active' }
];
async function testReturn({ authenticated = true, caronaOnly = false, failOnce = false, alreadySent = false } = {}) {
  const dom = await page('ingresso-retorno.html', `?order=${order}`), w = dom.window;
  const timers = [], uploads = [], submissions = []; let statusChecks = 0, fail = failOnce;
  w.setTimeout = fn => { timers.push(fn); return timers.length; }; w.clearTimeout = () => {};
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
  w.OnlySupabase = { getUser: async () => authenticated ? { id: 'owner' } : null,
    upload: async (bucket, path, file) => uploads.push({ bucket, path, file }),
    rest: async (path, args) => {
      if (path.startsWith('ticket_orders?')) return [{ status: ++statusChecks < 4 ? 'pending' : 'paid' }];
      if (path === 'rpc/customer_event_tickets') return caronaOnly ? [fixtures[1]] : fixtures;
      if (path.startsWith('ticket_media?')) return alreadySent ? [{ticket_id:fixtures[0].id,submission_count:2}] : [];
      if (path === 'rpc/customer_submit_ticket_photo') { if(fail){fail=false;throw Error('Falha temporária')} submissions.push(args.body); return { submission_count: 1, remaining: 1 }; }
      throw Error(`Unexpected ${path}`);
    }
  };
  w.eval(read('assets/js/ticket-return.js')); await tick();
  const qs = s => w.document.querySelector(s);
  if (!authenticated) {
    assert.equal(qs('[data-ticket-return-login]').hidden, false);
    assert.equal(new URL(qs('[data-ticket-return-login]').href).searchParams.get('next'), `ingresso-retorno.html?order=${order}`);
    assert.equal(timers.length, 0); dom.window.close(); return;
  }
  assert.equal(qs('[data-ticket-return-photos]').hidden, true);
  for (let i = 0; i < 3; i++) { const timer = timers.shift(); assert.ok(timer, 'must keep checking delayed payments'); timer(); await tick(); }
  const forms = [...w.document.querySelectorAll('[data-ticket-return-photo]')];
  assert.equal(forms.length, caronaOnly ? 0 : 2);
  assert.equal(qs('[data-ticket-return-check]').hidden, true);
  if (caronaOnly) { assert.equal(qs('[data-ticket-return-photos]').hidden, true); dom.window.close(); return; }
  if (alreadySent) {
    assert.equal(forms[0].querySelector('fieldset').disabled, true);
    assert.match(qs('[data-ticket-return-photo-progress]').textContent, /1 de 2/);
    dom.window.close(); return;
  }
  assert.deepEqual(forms.map(form => form.dataset.ticketId), [fixtures[0].id, fixtures[2].id]);
  for (const form of forms) {
    const file = new w.File(['fake-image'], 'car.jpg', { type: 'image/jpeg' });
    Object.defineProperty(form.elements.photo, 'files', { value: [file], configurable: true });
    form.reportValidity = () => true; form.elements.consent.checked = true;
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    if (failOnce && form === forms[0]) {
      assert.match(form.querySelector('[data-ticket-return-photo-feedback]').textContent, /Falha/);
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick();
    }
  }
  assert.equal(uploads.length, 2, 'retry must reuse the previously uploaded file');
  assert.deepEqual(submissions.map(item => item.p_ticket_id), [fixtures[0].id, fixtures[2].id]);
  assert.ok(uploads[1].path.includes(fixtures[2].id));
  assert.match(qs('[data-ticket-return-photo-progress]').textContent, /2 de 2/);
  assert.match(qs('[data-ticket-return-finish]').textContent, /Concluir/);
  dom.window.close();
}
async function testFilters() {
  const dom = await page('admin.html'), w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLMediaElement.prototype.pause = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.cancelAnimationFrame = () => {};
  const sales = [
    { ticket_id: 'a', driver_name: 'Ana', ticket_code: 'A', ticket_kind: null },
    { ticket_id: 'b', driver_name: 'Bruno', ticket_code: 'B', ticket_kind: 'carona' },
    { ticket_id: 'c', driver_name: 'Ana Combo', ticket_code: 'C', ticket_kind: 'combo' }
  ];
  w.OnlySupabase = { rest: async path => {
    if (path === 'rpc/admin_event_gate_events') return [{id:'event',name:'Test',starts_at:'2026-10-23'}];
    if (path === 'rpc/admin_event_ticket_sales') return sales;
    if (path.includes('stats') || path.includes('summary')) return {};
    return [];
  } };
  w.eval(read('assets/js/admin-event-tools.js'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await tick();
  w.document.querySelector('[data-gate-event]').click(); await tick(); await tick();
  const select = w.document.querySelector('[data-ticket-sales-kind]');
  const search = w.document.querySelector('[data-ticket-sales-search]');
  const ids = () => [...w.document.querySelectorAll('[data-ticket-sale-id]')].map(card => card.dataset.ticketSaleId);
  assert.deepEqual(ids(), ['a', 'b', 'c']);
  for (const [kind, expected] of [['expo',['a']],['carona',['b']],['combo',['c']]]) {
    select.value = kind; select.dispatchEvent(new w.Event('change')); assert.deepEqual(ids(), expected);
  }
  search.value = 'bruno'; search.dispatchEvent(new w.Event('input')); assert.deepEqual(ids(), []);
  select.value = 'carona'; select.dispatchEvent(new w.Event('change')); assert.deepEqual(ids(), ['b']);
  dom.window.close();
}
async function testContrast() {
  const dom = await page('ingresso.html'), w = dom.window;
  for (const path of ['assets/css/style.css', 'assets/css/event-live.css', 'assets/css/ticket-redesign.css']) {
    const style = w.document.createElement('style'); style.textContent = read(path); w.document.head.append(style);
  }
  for (const selector of ['.ticket-use-account strong','.ticket-holder-choice strong','.ticket-photo-note strong'])
    assert.equal(w.getComputedStyle(w.document.querySelector(selector)).color, 'rgb(23, 23, 23)');
  dom.window.close();
}
(async () => {
  const selected = 'ingresso.html?event=only-cars-meeting-2026&expo=2&carona=1&combo=1';
  await testLogin(selected, null, selected);
  await testLogin('ingresso', selected, selected);
  await testLogin(null, selected, selected);
  await testLogin(selected, null, selected, true);
  await testLogin('ingresso-retorno.html?order='+order, null, 'ingresso-retorno.html?order='+order);
  await testLogin('entrega.html', 'carrinho.html', 'entrega.html');
  await testLogin('https://evil.example/ingresso.html', selected, 'minha-conta.html');
  await testLogin('//evil.example/ingresso.html', selected, 'minha-conta.html');
  await testLogin('javascript:alert(1)', null, 'minha-conta.html');
  await testLogin(null, null, 'minha-conta.html');
  await testReturn(); await testReturn({failOnce:true}); await testReturn({alreadySent:true});
  await testReturn({caronaOnly:true}); await testReturn({authenticated:false});
  await testFilters(); await testContrast();
  console.log('PASS: login continuation and redirect safety, delayed payment, per-ticket photos, retry, prior submissions, carona-only, admin filters and checkout contrast.');
})().catch(error => { console.error(error); process.exitCode = 1; });
