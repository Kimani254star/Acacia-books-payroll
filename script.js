/* Public home page: single-view navigation, same behaviour as the Support site */
  function hpMore(btn){
    var card=btn.closest('.hp-tier');
    var open=card.classList.toggle('hp-open');
    btn.innerHTML=open?'Show less &#9652;':'Show '+btn.getAttribute('data-n')+' more features &#9662;';
  }
  function hpBillingToggle(){
    var yearly=document.getElementById('hpBilling').checked;
    document.querySelectorAll('#homePage .hp-amt').forEach(function(el){
      var p=yearly?+el.getAttribute('data-year'):+el.getAttribute('data-month');
      el.textContent='KES '+p.toLocaleString('en-US');
      var per=el.parentElement.querySelector('.hp-per');
      if(per) per.textContent=yearly?'/yr':'/mo';
    });
  }
(function(){
  var root=document.getElementById('homePage');
  var slides=root.querySelectorAll('.hp-slide'),si=0;
  setInterval(function(){
    if(root.style.display!=='block'||slides.length<2) return;
    slides[si].classList.remove('active'); si=(si+1)%slides.length; slides[si].classList.add('active');
  },5000);
  var nav=document.getElementById('hpNav'),burger=document.getElementById('hpBurger');
  burger.addEventListener('click',function(){
    var open=nav.classList.toggle('open');
    burger.setAttribute('aria-expanded',open?'true':'false');
  });
  var pages=root.querySelectorAll('.hp-page');
  var valid={top:1,about:1,features:1,process:1,pricing:1,faq:1,contact:1};
  function show(id){
    if(!valid[id]) id='top';
    pages.forEach(function(p){p.classList.toggle('hp-active',p.getAttribute('data-page')===id);});
    root.querySelectorAll('.hp-nav a').forEach(function(a){a.classList.toggle('hp-current',a.getAttribute('href')==='#'+id);});
    nav.classList.remove('open'); burger.setAttribute('aria-expanded','false');
    root.scrollTop=0;
  }
  root.querySelectorAll('a[data-scroll]').forEach(function(a){
    a.addEventListener('click',function(e){ e.preventDefault(); show(a.getAttribute('href').slice(1)); });
  });
  var y=document.getElementById('footerYear'); if(y) y.textContent=new Date().getFullYear();
  show('top');
  window.hpShowPage=show;
})();
function hpShowHome(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  document.getElementById('authScreen').style.display='flex';
  switchAuthTab(tab||'login');
}
function hpTheme(){
  if(typeof toggleTheme==='function'){ toggleTheme(); return; }
  var h=document.documentElement;
  if(h.getAttribute('data-theme')==='dark') h.removeAttribute('data-theme'); else h.setAttribute('data-theme','dark');
}
function hpContact(e){
  e.preventDefault();
  var n=document.getElementById('hpName').value.trim(), m=document.getElementById('hpEmail').value.trim(), t=document.getElementById('hpMsg').value.trim();
  var body='From: '+n+' <'+m+'>\n\n'+t;
  window.location.href='mailto:hello@example.com?subject='+encodeURIComponent('Acacia Payroll enquiry')+'&body='+encodeURIComponent(body);
  document.getElementById('contactConfirm').classList.remove('hidden');
  return false;
}

;
/* ===== acacia-cloud: shared Supabase layer for the Acacia apps (same project as Books) =====
   - Sign in / sign up against the same accounts Books uses (table app_accounts)
   - New companies + users show up in Support (acacia_company_status, app_accounts, acacia_app_usage)
   - Each app's data is saved per company in acacia_app_data and loaded on any device
   Needs acacia_apps_cloud.sql to be run once in Supabase. Offline: falls back to this browser's copy. */
(function (w) {
  'use strict';
  var URL_ = 'https://xglsampckermarjpczdf.supabase.co';
  var KEY_ = 'sb_publishable_x-dPR7pzhvJgag9soW0I8w_yfKTmi6A';
  var H = { apikey: KEY_, Authorization: 'Bearer ' + KEY_, 'Content-Type': 'application/json' };
  var cfg = null, ctx = null, timer = 0, hbTimer = 0;
  var rawSet = Storage.prototype.setItem;
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var enc = encodeURIComponent;
  var isCloudId = function (id) { return /^ACC-\d+$/i.test(String(id || '')); };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  async function req(path, opt) {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    try {
      var r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({ headers: H, signal: ctl ? ctl.signal : undefined }, opt || {}));
      if (t) clearTimeout(t);
      return r;
    } catch (e) { if (t) clearTimeout(t); throw err('offline', 'Cannot reach the Acacia cloud. Check your internet connection.'); }
  }
  async function rpc(name, args) {
    var r = await req('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      var e = err(/already exists|exists/i.test(m) ? 'exists' : (r.status === 404 ? 'missing' : 'rpc'), m); e.status = r.status; throw e;
    }
    return j;
  }

  /* same hashing as Books: SHA-256 of "salt:password" */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function hash(pass, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass))); }
  async function verify(d, pass) {
    d = d || {};
    if (d.passwordHash && d.passwordSalt) return (await hash(pass, d.passwordSalt)) === d.passwordHash;
    return typeof d.password === 'string' && d.password === pass;
  }
  function mapRole(r, d) { return cfg && cfg.mapRole ? cfg.mapRole(r, d) : (/^admin/i.test(String(r || '')) ? 'Administrator' : (r || 'Administrator')); }

  /* deleted / suspended companies are blocked (fails open if the cloud can't be reached) */
  async function gate(cid, login) {
    try { if ((await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })) === 'deleted') return 'This account was removed by Acacia support.'; } catch (e) {}
    try {
      var r = await req('acacia_company_status?select=status&company_id=eq.' + enc(cid));
      if (r.ok) { var j = await r.json(); var s = j[0] && j[0].status; if (s === 'pending') return 'Your company is waiting for approval by Acacia support. You will be able to sign in as soon as it is approved.'; if (s && s !== 'active') return 'Your company account is "' + s + '". Please contact Acacia support.'; }
    } catch (e) {}
    return null;
  }

  async function signIn(email, pass, company) {
    email = low(email);
    var r = await req('app_accounts?select=login_id,username,company_id,data&login_id=eq.' + enc(email));
    if (!r.ok) throw err('offline', 'Could not read accounts (' + r.status + '). Run acacia_apps_cloud.sql in Supabase.');
    var rows = await r.json(), ok = [], cn = low(company);
    if (cn) rows = rows.filter(function (x) { var d = x.data || {}; return low(d.companyName) === cn || low(x.company_id) === cn || (d.previousCompanyNames || []).map(low).indexOf(cn) > -1; });
    for (var i = 0; i < rows.length; i++) if (await verify(rows[i].data, pass)) ok.push(rows[i]);
    if (!ok.length) return null;
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app, p_plan: o.plan || '', p_billing: o.billing || 'monthly' });
    var blocked = await gate(id, o.email);
    return { companyId: id, passwordHash: h, passwordSalt: salt, blocked: blocked };
  }

  /* teammates added inside an app (CRM Users & Roles). The app's own role is kept per app; Books sees admin/user */
  var booksRole = function (r) { return /^admin/i.test(String(r || '')) ? 'admin' : 'user'; };
  async function addUser(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    await rpc('acx_add_user', { p_company: o.companyId, p_name: o.name, p_email: low(o.email), p_role: booksRole(o.role), p_hash: h, p_salt: salt, p_app: cfg.app, p_app_role: o.role || '' });
    return { passwordHash: h, passwordSalt: salt };
  }
  function setRole(companyId, email, role) { return rpc('acx_set_user_role', { p_company: companyId, p_email: low(email), p_role: booksRole(role), p_app: cfg.app, p_app_role: role || '' }); }
  function removeUser(companyId, email) { return rpc('acx_remove_user', { p_company: companyId, p_email: low(email) }); }

  /* keep a copy of cloud users in this browser so the app's own session code keeps working (and offline sign-in) */
  function cacheUser(usersKey, u) {
    try {
      var list = JSON.parse(localStorage.getItem(usersKey) || '[]');
      var rec = { companyId: u.companyId, company: u.company, name: u.name, email: low(u.email), role: u.role, passwordHash: u.passwordHash, passwordSalt: u.passwordSalt };
      var i = list.findIndex(function (x) { return low(x.email) === rec.email && x.companyId === rec.companyId; });
      if (i > -1) { list[i] = Object.assign({}, list[i], rec); delete list[i].password; } else list.push(rec);
      rawSet.call(localStorage, usersKey, JSON.stringify(list));
    } catch (e) {}
  }
  function verifyLocal(u, pass) { return verify(u, pass); }

  /* accounts that only ever existed in this browser get a cloud company; their data and teammates move with them.
     'all' is the local users array: it is updated in place (caller saves it). Returns the signed-in user's new record. */
  async function migrate(u, pass, all) {
    var oldId = u.companyId, same = (all || [u]).filter(function (x) { return x.companyId === oldId; });
    var owner = same.find(function (x) { return /^admin/i.test(String(x.role || 'Administrator')) && x.password; }) || u;
    var ownerPass = owner === u ? pass : owner.password;
    var r = await register({ company: owner.company, name: owner.name, email: owner.email, password: ownerPass });
    for (var i = 0; i < same.length; i++) {
      var x = same[i];
      if (x === owner) { x.passwordHash = r.passwordHash; x.passwordSalt = r.passwordSalt; }
      else {
        var pw = x === u ? pass : x.password;
        if (pw) { try { var h = await addUser({ companyId: r.companyId, name: x.name, email: x.email, password: pw, role: x.role || 'Administrator' }); x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; } catch (e) { continue; } }
        else continue;
      }
      delete x.password; x.companyId = r.companyId;
    }
    var o = cfg.dataKey(oldId), n = cfg.dataKey(r.companyId), v = localStorage.getItem(o);
    if (v != null) { rawSet.call(localStorage, n, v); localStorage.removeItem(o); rawSet.call(localStorage, dirtyKey(r.companyId), '1'); }
    return same.find(function (x) { return low(x.email) === low(u.email) && x.companyId === r.companyId; }) || null;
  }

  /* ---- data sync (one JSON blob per company per app) ---- */
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    if (!r.ok) return null; var j = await r.json(); return j[0] || null;
  }
  async function pushNow() {
    if (!ctx || !isCloudId(ctx.companyId)) return false;
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return false;
    try {
      var r = await req('acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) });
      if (r.ok) { var j = await r.json(); rawSet.call(localStorage, tsKey(), (j[0] && j[0].updated_at) || ''); localStorage.removeItem(dirtyKey()); return true; }
    } catch (e) {}
    return false;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(pushNow, 2500);
  }
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return;
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) }).then(function (r) { if (r.ok) localStorage.removeItem(dirtyKey()); }).catch(function () {});
    } catch (e) {}
  }
  async function pullData() {
    var row = await pullRow(cfg.app);
    var dirty = localStorage.getItem(dirtyKey()) === '1', last = localStorage.getItem(tsKey());
    if (row && !dirty && row.updated_at !== last) { rawSet.call(localStorage, cfg.dataKey(ctx.companyId), row.value); rawSet.call(localStorage, tsKey(), row.updated_at); }
    else if (!row) { if (localStorage.getItem(cfg.dataKey(ctx.companyId)) != null) await pushNow(); }
    else if (dirty) await pushNow();
  }
  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullExtras() {
    var ex = cfg.readFrom || [];
    for (var i = 0; i < ex.length; i++) { try { var row = await pullRow(ex[i].app); if (row) rawSet.call(localStorage, ex[i].dataKey(ctx.companyId), row.value); } catch (e) {} }
  }

  function heartbeat() {
    if (!ctx || !isCloudId(ctx.companyId) || !ctx.email) return;
    var k = 'acx_hb_' + ctx.companyId + '_' + cfg.app + '_' + ctx.email;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3e5) return;
    rawSet.call(localStorage, k, String(Date.now()));
    try { fetch(URL_ + '/rest/v1/rpc/acx_heartbeat', { method: 'POST', headers: H, keepalive: true, body: JSON.stringify({ p_company: ctx.companyId, p_app: cfg.app, p_user: ctx.email, p_role: String(ctx.role || '') }) }).catch(function () {}); } catch (e) {}
  }

  /* called when a user enters the app: returns 'ok' | 'local' | 'blocked:<message>' */
  async function start(user) {
    ctx = { companyId: user.companyId, email: low(user.email), role: user.role || '' };
    if (!isCloudId(ctx.companyId)) return 'local';
    var msg = await gate(ctx.companyId, ctx.email); if (msg) return 'blocked:' + msg;
    try { await pullData(); await pullExtras(); } catch (e) {}
    heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  /* sign-up plan note: reads #regPlan / #regBilling and shows what the company will pay */
  w.acxPlanChanged = function () {
    var s = document.getElementById('regPlan'), b = document.getElementById('regBilling'), n = document.getElementById('regPlanNote');
    if (!s || !n) return;
    var o = s.options[s.selectedIndex], p = Number((o && o.getAttribute('data-price')) || 0), y = !!b && b.value === 'yearly';
    var f = function (x) { return 'KES ' + x.toLocaleString('en-US'); };
    n.textContent = y ? f(p * 10) + ' for the year (2 months free). Billed after Acacia support approves your account.' : f(p) + ' per month. Billed after Acacia support approves your account.';
  };
  setTimeout(function () { try { if (w.acxPlanChanged) w.acxPlanChanged(); } catch (e) {} }, 0);

  w.AcaciaCloud = { init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
;
/* =========================================================================
   ACACIA PAYROLL — state, calculation engine, and views
   ========================================================================= */

const USERS_KEY = 'acacia-payroll-users';
const SESSION_KEY = 'acacia-payroll-session';
function dataKeyFor(companyId){ return 'acacia-payroll-state_' + companyId; }
function initials(name){ return (name||'').split(' ').filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join(''); }

let state = null;
let CURRENT_USER = null;
let ui = { view:'dashboard', empFilter:'', empDeptFilter:'', activeRunDraft:null, reportSel:'summary', settingsTab:'company', payslipRunId:null, payslipEmpId:null };

function uid(prefix){ return prefix + '-' + Math.random().toString(36).slice(2,9); }
function fmt(n){ n = Math.round(n||0); return n.toLocaleString('en-KE'); }
function fmtKES(n){ return 'KES ' + fmt(n); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

/* ---------------------------- Blank starting dataset (no demo data) ---------------------------- */
function defaultState(companyName){
  return {
    company:{ name:companyName||'My Company', currency:'KES', kraPin:'', address:'', logoText:(companyName||'ACACIA').toUpperCase() },
    departments:['Finance','Sales','IT','Operations','HR'],
    jobTitles:['Accountant','Sales Executive','Software Engineer','Operations Officer','HR Officer','Administrator'],
    payAccounts:{ salaryExpense:'6000 · Salaries & Wages Expense', statutoryExpense:'6010 · Employer Statutory Contributions',
      payePayable:'2100 · PAYE Payable', nssfPayable:'2110 · NSSF Payable', shifPayable:'2120 · SHIF Payable',
      otherPayable:'2130 · Other Payroll Payables', netPayable:'2140 · Net Salaries Payable', bank:'1000 · Bank – Operating Account' },
    bankSettings:{ bankName:'Acacia Corporate Bank', accountNo:'0110293847', paymentMethod:'EFT Batch' },
    allowanceTypes:['Housing','Transport','Medical','Meal','Travel','Overtime','Bonus','Commission','Other Allowance'],
    deductionTypes:['Loan','Salary Advance','Absence','Other Deduction'],
    statutory:{
      payeBands:[ {upTo:24000, rate:0.10}, {upTo:32333, rate:0.25}, {upTo:500000, rate:0.30}, {upTo:800000, rate:0.325}, {upTo:null, rate:0.35} ],
      personalRelief:2400,
      nssfTier1Limit:8000, nssfTier2Limit:72000, nssfRate:0.06,
      shifRate:0.0275, shifMin:300,
      housingLevyRate:0.015
    },
    employees:[],
    attendance:[],
    payRuns:[],
    nextEmpSeq:1
  };
}
function mkEmp(empNo,name,dept,title,date,basic,phone,email,bank,acct,allow,ded){
  return { id:uid('emp'), empNo,name,department:dept,jobTitle:title,employmentDate:date,basicSalary:basic,
    phone,email,bankName:bank,bankAccount:acct,kraPin:'A0'+Math.floor(10000000+Math.random()*89999999)+'Z',
    nssfNo:'NSF'+Math.floor(100000+Math.random()*899999), shifNo:'SHF'+Math.floor(100000+Math.random()*899999),
    status:'Active', allowances:allow||[], deductions:ded||[], leaveBalance:21 };
}

/* ---------------------------- Persistence (per-company, saved in this browser) ---------------------------- */
function loadCompanyState(companyId, companyName){
  try{
    const raw = localStorage.getItem(dataKeyFor(companyId));
    if(raw) return JSON.parse(raw);
  }catch(e){ /* not found yet */ }
  const blank = defaultState(companyName);
  try{ localStorage.setItem(dataKeyFor(companyId), JSON.stringify(blank)); }catch(e){ console.error('init save failed', e); }
  return blank;
}
let saveTimer=null;
function saveState(){
  return new Promise((resolve)=>{
    if(!CURRENT_USER){ resolve(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(()=>{
      try{ localStorage.setItem(dataKeyFor(CURRENT_USER.companyId), JSON.stringify(state)); }catch(e){ console.error('save failed', e); }
      resolve();
    }, 120);
  });
}

/* ---------------------------- Auth ---------------------------- */
AcaciaCloud.init({app:'Payroll', dataKey:dataKeyFor});
function getUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }catch(e){ return []; }
}
function saveUsers(list){ try{ localStorage.setItem(USERS_KEY, JSON.stringify(list)); }catch(e){ console.error(e); } }
function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }catch(e){ return null; }
}
function setSession(user){
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify({companyId:user.companyId, company:user.company, name:user.name, email:user.email})); }catch(e){ console.error(e); }
}
function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){ /* nothing to clear */ } }

function switchAuthTab(which){
  document.getElementById('tabLoginBtn').classList.toggle('active', which==='login');
  document.getElementById('tabRegisterBtn').classList.toggle('active', which==='register');
  document.getElementById('loginPane').style.display = which==='login' ? 'block' : 'none';
  document.getElementById('registerPane').style.display = which==='register' ? 'block' : 'none';
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('registerError').classList.remove('show');
}
function showAuthError(id, msg){
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}
async function handleRegister(){
  const company = document.getElementById('regCompany').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  if(!company || !name || !email || !password){ showAuthError('registerError','Please fill in every field.'); return; }
  if(password.length < 6){ showAuthError('registerError','Password must be at least 6 characters.'); return; }
  const users = getUsers();
  let user, viaCloud = false;
  try{
    const c = await AcaciaCloud.register({company, name, email, password, plan:(document.getElementById('regPlan')||{}).value||'', billing:(document.getElementById('regBilling')||{}).value||'monthly'});
    if(c.blocked){ showAuthError('registerError','Account created. ' + c.blocked); return; }
    user = {companyId:c.companyId, company, name, email, role:'Administrator', passwordHash:c.passwordHash, passwordSalt:c.passwordSalt};
    viaCloud = true;
  }catch(e){
    if(e.code === 'exists'){ showAuthError('registerError','This company already has an account with that email. Please sign in instead.'); return; }
    if(e.code !== 'offline'){ showAuthError('registerError', e.message || 'Could not create the account. Please try again.'); return; }
    if(users.some(u=>u.email===email)){ showAuthError('registerError','An account with that email already exists.'); return; }
    user = {companyId:uid('co'), company, name, email, password, role:'Administrator'};   // offline: uploaded the next time you sign in online
  }
  if(viaCloud) AcaciaCloud.cacheUser(USERS_KEY, user); else { users.push(user); saveUsers(users); }
  setSession(user);
  await enterApp(user);
}
async function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const company = (document.getElementById('loginCompany').value || '').trim();
  if(!company || !email || !password){ showAuthError('loginError','Please enter your company name, email and password.'); return; }
  let user = null;
  try{
    user = await AcaciaCloud.signIn(email, password, company);
    if(user) AcaciaCloud.cacheUser(USERS_KEY, user);
  }catch(e){
    if(e.code === 'blocked'){ showAuthError('loginError', e.message); return; }
  }
  if(!user){
    const users = getUsers();
    for(const u of users){ if(u.email === email && String(u.company||'').trim().toLowerCase() === company.toLowerCase() && await AcaciaCloud.verifyLocal(u, password)){ user = u; break; } }
    if(!user){ showAuthError('loginError','That email and password combination was not found.'); return; }
    if(!AcaciaCloud.isCloudId(user.companyId)){
      try{ const moved = await AcaciaCloud.migrate(user, password, users); if(moved){ saveUsers(users); user = moved; } }catch(e){ /* offline: stays on this device for now */ }
    }
  }
  setSession(user);
  await enterApp(user);
}
async function handleLogout(){
  AcaciaCloud.stop();
  await clearSession();
  CURRENT_USER = null;
  state = null;
  document.getElementById('shell').classList.remove('ready');
  hpShowHome();
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  switchAuthTab('login');
}
function toggleUserMenu(e){
  e.stopPropagation();
  document.getElementById('userMenuPanel').classList.toggle('open');
}
document.addEventListener('click', ()=>{ const m=document.getElementById('userMenuPanel'); if(m) m.classList.remove('open'); });

async function enterApp(user){
  let res = 'local';
  try{ res = await AcaciaCloud.start(user); }catch(e){}
  if(String(res).indexOf('blocked:') === 0){
    try{ clearSession(); }catch(e){}
    AcaciaCloud.stop();
    alert(String(res).slice(8));
    location.reload();
    return;
  }
  return __enterAppLocal(user);
}
async function __enterAppLocal(user){
  try{
    CURRENT_USER = user;
    state = loadCompanyState(user.companyId, user.company);
    if(!state.attendance) state.attendance=[];
    document.getElementById('authScreen').style.display = 'none'; hpHideHome();
    document.getElementById('shell').classList.add('ready');
    document.getElementById('userAvatar').textContent = initials(user.name) || 'U';
    document.getElementById('userNameLabel').textContent = user.name;
    document.getElementById('userMenuCompany').textContent = user.company;
    ui = { view:'dashboard', empFilter:'', empDeptFilter:'', activeRunDraft:null, reportSel:'summary', settingsTab:'company', payslipRunId:null, payslipEmpId:null };
    renderAll();
  }catch(e){
    console.error('enterApp failed', e);
    showAuthError('loginError', 'Something went wrong opening your workspace. Please try again.');
    showAuthError('registerError', 'Something went wrong opening your workspace. Please try again.');
  }
}

/* =========================================================================
   CALCULATION ENGINE
   ========================================================================= */
function calcPAYE(taxablePay, statutory){
  let remaining = taxablePay, tax = 0, lowerBound = 0;
  for(const band of statutory.payeBands){
    const upTo = band.upTo===null ? Infinity : band.upTo;
    const bandWidth = upTo - lowerBound;
    const amountInBand = Math.max(0, Math.min(remaining, bandWidth));
    tax += amountInBand * band.rate;
    remaining -= amountInBand;
    lowerBound = upTo;
    if(remaining<=0) break;
  }
  tax = Math.max(0, tax - statutory.personalRelief);
  return tax;
}
function calcNSSF(pensionablePay, statutory){
  const t1 = Math.min(pensionablePay, statutory.nssfTier1Limit) * statutory.nssfRate;
  const t2 = Math.max(0, Math.min(pensionablePay, statutory.nssfTier2Limit) - statutory.nssfTier1Limit) * statutory.nssfRate;
  return { tier1:t1, tier2:t2, total:t1+t2 };
}
function calcSHIF(gross, statutory){
  return Math.max(gross*statutory.shifRate, statutory.shifMin);
}
function calcHousingLevy(gross, statutory){
  return gross*statutory.housingLevyRate;
}

/** Compute a full line for one employee within a run, given editable overtime/bonus overrides */
function computeEmployeeLine(emp, overrides, statutory){
  overrides = overrides || {};
  const basic = emp.basicSalary;
  const allowancesTotal = (emp.allowances||[]).reduce((s,a)=>s+Number(a.amount||0),0);
  const overtime = Number(overrides.overtime||0);
  const bonus = Number(overrides.bonus||0);
  const otherDeductionsTotal = (emp.deductions||[]).reduce((s,d)=>s+Number(d.amount||0),0) + Number(overrides.extraDeduction||0);

  const gross = basic + allowancesTotal + overtime + bonus;
  const nssf = calcNSSF(basic, statutory); // pensionable pay = basic salary
  const housingLevy = calcHousingLevy(gross, statutory);
  const taxable = Math.max(0, gross - nssf.total - housingLevy);
  const paye = calcPAYE(taxable, statutory);
  const shif = calcSHIF(gross, statutory);
  const totalDeductions = paye + nssf.total + shif + housingLevy + otherDeductionsTotal;
  const net = gross - totalDeductions;

  return {
    employeeId:emp.id, empNo:emp.empNo, name:emp.name, department:emp.department,
    basic, allowancesTotal, allowancesDetail:emp.allowances||[], overtime, bonus,
    gross, paye, nssf:nssf.total, shif, housingLevy, otherDeductions:otherDeductionsTotal, otherDeductionsDetail:emp.deductions||[],
    totalDeductions, net
  };
}

function sumRun(lines){
  const t = { basic:0, allowances:0, overtime:0, bonus:0, gross:0, paye:0, nssf:0, shif:0, housingLevy:0, otherDeductions:0, net:0 };
  lines.forEach(l=>{
    t.basic+=l.basic; t.allowances+=l.allowancesTotal; t.overtime+=l.overtime; t.bonus+=l.bonus;
    t.gross+=l.gross; t.paye+=l.paye; t.nssf+=l.nssf; t.shif+=l.shif; t.housingLevy+=l.housingLevy;
    t.otherDeductions+=l.otherDeductions; t.net+=l.net;
  });
  return t;
}

/* =========================================================================
   NAVIGATION
   ========================================================================= */
const NAV = [
  {sec:'', items:[ {id:'dashboard', label:'Dashboard', ico:'◆'} ]},
  {sec:'Payroll Hub', items:[
    {id:'employees', label:'Employees', ico:'☰'},
    {id:'allowances', label:'Earnings & Allowances', ico:'+'},
    {id:'runpayroll', label:'Earnings & Deductions', ico:'▶'},
    {id:'attendance', label:'Attendance & Leave', ico:'◷'},
    {id:'payslips', label:'Payslip Generation', ico:'▥'},
    {id:'taxes', label:'Statutories', ico:'§'},
    {id:'reports', label:'Payroll Reports', ico:'▦'},
    {id:'integrations', label:'Integrations', ico:'⇄'},
  ]},
  {sec:'', items:[ {id:'settings', label:'Settings', ico:'⚙'} ]},
];

function renderNav(){
  const el = document.getElementById('navPrimary');
  let html='';
  NAV.forEach(group=>{
    if(group.sec) html += `<div class="grp-label">${group.sec}</div>`;
    group.items.forEach(it=>{
      html += `<div class="navitem ${ui.view===it.id?'active':''}" onclick="goTo('${it.id}')"><span class="ico">${it.ico}</span>${it.label}</div>`;
    });
  });
  el.innerHTML = html;
}
function goTo(view){ ui.view = view; renderAll(); closeGlobalSearch(); window.scrollTo(0,0); }

/* ---------------------------- Global search ---------------------------- */
function handleGlobalSearch(q){
  const box = document.getElementById('searchResults');
  if(!q || !q.trim()){ box.classList.remove('open'); box.innerHTML=''; return; }
  const term = q.trim().toLowerCase();
  const empMatches = state.employees.filter(e=> (e.name+' '+e.empNo+' '+e.department+' '+e.jobTitle).toLowerCase().includes(term)).slice(0,5);
  const runMatches = state.payRuns.filter(r=> r.period.toLowerCase().includes(term)).slice(0,4);
  let html = '';
  if(empMatches.length){
    html += `<div class="sr-group-label">Employees</div>` + empMatches.map(e=>
      `<div class="sr-item" onclick="document.getElementById('globalSearch').value=''; closeGlobalSearch(); openEmployeeModal('${e.id}','view');">
        <span>${e.name}</span><span class="sr-sub">${e.empNo} · ${e.department}</span></div>`).join('');
  }
  if(runMatches.length){
    html += `<div class="sr-group-label">Pay Runs</div>` + runMatches.map(r=>
      `<div class="sr-item" onclick="document.getElementById('globalSearch').value=''; ui.openRunId='${r.id}'; goTo('payruns');">
        <span>${r.period}</span><span class="sr-sub">${statusPill(r.status)}</span></div>`).join('');
  }
  if(!empMatches.length && !runMatches.length){ html = `<div class="sr-empty">No matches for "${q}"</div>`; }
  box.innerHTML = html;
  box.classList.add('open');
}
function closeGlobalSearch(){
  const box = document.getElementById('searchResults');
  if(box){ box.classList.remove('open'); box.innerHTML=''; }
  const input = document.getElementById('globalSearch');
  if(input) input.value='';
}
document.addEventListener('click', (e)=>{
  const box = document.getElementById('searchResults');
  const input = document.getElementById('globalSearch');
  if(box && input && !input.contains(e.target) && !box.contains(e.target)) box.classList.remove('open');
});

/* ---------------------------- Statutory compliance calendar ---------------------------- */
function complianceItems(){
  const runs = [...state.payRuns].sort((a,b)=>b.createdAt-a.createdAt);
  const latest = runs[0];
  if(!latest) return null;
  const payDate = new Date(latest.payDate+'T00:00:00');
  const dueDate = new Date(payDate.getFullYear(), payDate.getMonth()+1, 9);
  const today = new Date(); today.setHours(0,0,0,0);
  const daysLeft = Math.round((dueDate-today)/86400000);
  const remitted = latest.status==='Paid';
  const rows = [
    {name:'PAYE (KRA)', amount:latest.totals.paye},
    {name:'NSSF', amount:latest.totals.nssf*2},
    {name:'SHIF', amount:latest.totals.shif},
    {name:'Housing Levy', amount:latest.totals.housingLevy*2},
  ];
  return {period:latest.period, dueDate, daysLeft, remitted, rows};
}
function complianceBadge(daysLeft, remitted){
  if(remitted) return `<span class="compliance-badge ok">Remitted</span>`;
  if(daysLeft<0) return `<span class="compliance-badge late">${Math.abs(daysLeft)}d overdue</span>`;
  if(daysLeft<=5) return `<span class="compliance-badge soon">Due in ${daysLeft}d</span>`;
  return `<span class="compliance-badge ok">Due in ${daysLeft}d</span>`;
}
function ytdTotals(){
  const year = new Date().getFullYear();
  const runs = state.payRuns.filter(r=> new Date(r.payDate+'T00:00:00').getFullYear()===year);
  const t = runs.reduce((acc,r)=>{
    acc.gross+=r.totals.gross; acc.net+=r.totals.net; acc.paye+=r.totals.paye;
    acc.statutory += r.totals.nssf*2 + r.totals.shif + r.totals.housingLevy*2;
    return acc;
  }, {gross:0, net:0, paye:0, statutory:0});
  return { ...t, runCount: runs.length, year };
}


function renderAll(){
  renderNav();
  const v = document.getElementById('view');
  const renderers = {
    dashboard: viewDashboard, employees: viewEmployees, runpayroll: viewRunPayroll,
    payruns: viewPayRuns, payslips: viewPayslips, allowances: viewAllowances,
    deductions: viewDeductions, attendance: viewAttendance, integrations: viewIntegrations, taxes: viewTaxes, reports: viewReports, settings: viewSettings
  };
  v.innerHTML = (renderers[ui.view]||viewDashboard)();
}

function toast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className='toast'; el.innerHTML = '✓ ' + msg;
  root.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=>el.remove(),300); }, 2200);
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
function greetingWord(){
  const h = new Date().getHours();
  if(h<12) return 'Good morning';
  if(h<17) return 'Good afternoon';
  return 'Good evening';
}
function deltaHTML(cur, prev){
  if(prev===undefined || prev===null || prev===0) return `<div class="delta flat">No prior run to compare</div>`;
  const pct = ((cur-prev)/Math.abs(prev))*100;
  if(Math.abs(pct)<0.5) return `<div class="delta flat">Flat vs last run</div>`;
  const up = pct>0;
  return `<div class="delta ${up?'up':'down'}">${up?'▲':'▼'} ${Math.abs(pct).toFixed(1)}% vs last run</div>`;
}
function viewDashboard(){
  const activeEmployees = state.employees.filter(e=>e.status==='Active');
  const runs = [...state.payRuns].sort((a,b)=>b.createdAt-a.createdAt);
  const latest = runs[0];
  const prev = runs[1];
  const gross = latest ? latest.totals.gross : 0;
  const net = latest ? latest.totals.net : 0;
  const paye = latest ? latest.totals.paye : 0;
  const nssfShif = latest ? latest.totals.nssf + latest.totals.shif : 0;

  const currentPeriodLabel = new Date().toLocaleString('en-KE',{month:'long', year:'numeric'});
  const hasCurrentRun = runs.some(r=>r.period===currentPeriodLabel);
  const pendingApproval = runs.filter(r=>r.status==='Approved');
  const pendingPayment = runs.filter(r=>r.status==='Posted');
  const missingBank = activeEmployees.filter(e=>!e.bankAccount||!e.kraPin);

  const alerts = [];
  if(!hasCurrentRun) alerts.push({warn:true, txt:`Payroll for <b>${currentPeriodLabel}</b> hasn't been run yet.`, action:`goTo('runpayroll')`, actionLabel:'Run it now'});
  if(ui.activeRunDraft && ['Draft','Calculated'].includes(ui.activeRunDraft.status)) alerts.push({warn:false, txt:`A payroll run for <b>${ui.activeRunDraft.period}</b> is saved as a draft, not yet approved.`, action:`goTo('runpayroll')`, actionLabel:'Continue'});
  pendingApproval.forEach(r=>alerts.push({warn:false, txt:`<b>${r.period}</b> is approved and waiting to be posted to the ledger.`, action:`ui.openRunId='${r.id}'; goTo('payruns')`, actionLabel:'Post now'}));
  pendingPayment.forEach(r=>alerts.push({warn:false, txt:`<b>${r.period}</b> is posted and waiting to be marked as paid.`, action:`ui.openRunId='${r.id}'; goTo('payruns')`, actionLabel:'Mark paid'}));
  if(missingBank.length) alerts.push({warn:false, txt:`<b>${missingBank.length}</b> active employee${missingBank.length>1?'s are':' is'} missing bank details or a KRA PIN.`, action:`goTo('employees')`, actionLabel:'Review'});
  if(activeEmployees.length===0) alerts.push({warn:true, txt:`No active employees on record yet — add your first employee to get started.`, action:`goTo('employees')`, actionLabel:'Add employee'});

  const trendRuns = runs.slice(0,6).reverse();
  const maxNet = Math.max(1, ...trendRuns.map(r=>r.totals.net));

  return `
  <div class="dash-hero">
    <div>
      <div class="greet">${greetingWord()} — ${state.company.name}</div>
      <div class="sub">${new Date().toLocaleDateString('en-KE',{weekday:'long', day:'numeric', month:'long', year:'numeric'})} · ${activeEmployees.length} active employees</div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-gold" onclick="goTo('runpayroll')">+ Run Payroll</button>
      <button class="btn btn-hero-ghost" onclick="openEmployeeModal()">+ Add Employee</button>
      <button class="btn btn-hero-ghost" onclick="goTo('reports')">View Reports</button>
    </div>
  </div>

  ${alerts.length? `
  <section class="block">
    <h2>Needs Attention <span class="badge-count">${alerts.length}</span></h2>
    <div class="alert-list">
      ${alerts.map(a=>`<div class="alert-item ${a.warn?'warn':''}"><div class="dot"></div><div class="txt">${a.txt}</div><button class="btn btn-sm" onclick="${a.action}">${a.actionLabel}</button></div>`).join('')}
    </div>
  </section>` : ''}

  <div class="statgrid">
    <div class="statcard"><div class="lbl">Employees</div><div class="val">${activeEmployees.length}</div></div>
    <div class="statcard"><div class="lbl">${latest?latest.period+' Gross':'This Month'}</div><div class="val">${fmtKES(gross)}</div>${latest?deltaHTML(gross, prev&&prev.totals.gross):''}</div>
    <div class="statcard"><div class="lbl">Net Pay</div><div class="val">${fmtKES(net)}</div>${latest?deltaHTML(net, prev&&prev.totals.net):''}</div>
    <div class="statcard"><div class="lbl">PAYE</div><div class="val gold">${fmtKES(paye)}</div>${latest?deltaHTML(paye, prev&&prev.totals.paye):''}</div>
    <div class="statcard"><div class="lbl">NSSF / SHIF</div><div class="val gold">${fmtKES(nssfShif)}</div></div>
  </div>

  <div class="dash-grid">
    <div>
      <section class="block">
        <h2>Net Pay Trend</h2>
        <div class="panel">
          ${trendRuns.length? `<div class="trend-chart">
            ${trendRuns.map(r=>`<div class="trend-bar-col ${r.id===(latest&&latest.id)?'current':''}">
              <div class="amt">${(r.totals.net/1000).toFixed(0)}K</div>
              <div class="bar" style="height:${Math.max(4, (r.totals.net/maxNet)*110)}px;"></div>
              <div class="lbl">${r.period.split(' ')[0].slice(0,3)}</div>
            </div>`).join('')}
          </div>` : `<div class="empty" style="padding:24px;">Run payroll to start building a trend.</div>`}
        </div>
      </section>

      <section class="block">
        <h2>Payroll Runs</h2>
        ${runs.length? `
        <table class="grid">
          <thead><tr><th>Period</th><th>Employees</th><th class="num">Gross Pay</th><th class="num">Net Pay</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${runs.slice(0,6).map(r=>`
              <tr class="clickable" onclick="openPayRun('${r.id}')">
                <td class="row-name">${r.period}</td>
                <td>${r.employeeIds.length} Employees</td>
                <td class="num">${fmt(r.totals.gross)}</td>
                <td class="num">${fmt(r.totals.net)}</td>
                <td>${statusPill(r.status)}</td>
                <td class="num"><span class="btn btn-sm btn-ghost">View →</span></td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="empty"><div class="big">🌿</div>No payroll runs yet. Start your first pay run below.</div>`}
        <div style="margin-top:14px;"><button class="btn btn-primary" onclick="goTo('runpayroll')">+ Run Payroll</button></div>
      </section>
    </div>

    <div>
      <section class="block">
        <h2>Statutory Compliance</h2>
        <div class="panel">
          ${(()=>{
            const c = complianceItems();
            if(!c) return `<div class="empty" style="padding:10px 0;">Run and approve payroll to see remittance deadlines.</div>`;
            const dueStr = c.dueDate.toLocaleDateString('en-KE',{day:'numeric', month:'short', year:'numeric'});
            return `
            <div class="hint" style="margin-bottom:10px;">Based on ${c.period} payroll · typically due by the 9th of the following month.</div>
            ${c.rows.map(r=>`
              <div class="compliance-row">
                <div><div class="cname">${r.name}</div><div class="cdue">${fmtKES(r.amount)} · due ${dueStr}</div></div>
                ${complianceBadge(c.daysLeft, c.remitted)}
              </div>`).join('')}`;
          })()}
        </div>
      </section>

      <section class="block">
        <h2>Year to Date — ${new Date().getFullYear()}</h2>
        <div class="panel">
          ${(()=>{
            const y = ytdTotals();
            if(!y.runCount) return `<div class="empty" style="padding:10px 0;">No payroll runs posted this year yet.</div>`;
            return `
            <div class="kv-row"><span class="k">Payroll Runs</span><span class="v">${y.runCount}</span></div>
            <div class="kv-row"><span class="k">Gross Paid</span><span class="v">${fmtKES(y.gross)}</span></div>
            <div class="kv-row"><span class="k">PAYE Remitted</span><span class="v">${fmtKES(y.paye)}</span></div>
            <div class="kv-row"><span class="k">NSSF/SHIF/Levy</span><span class="v">${fmtKES(y.statutory)}</span></div>
            <div class="kv-row total"><span class="k">Net Pay</span><span class="v">${fmtKES(y.net)}</span></div>`;
          })()}
        </div>
      </section>

      <section class="block">
        <h2>Department Cost Share</h2>
        <div class="panel">
          ${(()=>{
            const rows = state.departments.map(d=>{
              const emps = activeEmployees.filter(e=>e.department===d);
              const total = emps.reduce((s,e)=>s+e.basicSalary,0);
              return {d, count:emps.length, total};
            });
            const maxTotal = Math.max(1, ...rows.map(r=>r.total));
            if(!activeEmployees.length) return `<div class="empty" style="padding:10px 0;">No employees yet.</div>`;
            return rows.map(r=>`
              <div class="dept-bar-row">
                <div class="dept-bar-top"><span class="row-name">${r.d}</span><span class="n">${r.count} · ${fmtKES(r.total)}</span></div>
                <div class="dept-bar-track"><div class="dept-bar-fill" style="width:${(r.total/maxTotal*100).toFixed(0)}%;"></div></div>
              </div>`).join('');
          })()}
        </div>
      </section>

      <section class="block">
        <h2>Recently Added</h2>
        <div class="panel">
          ${(()=>{
            const recent = [...state.employees].sort((a,b)=> (b.id>a.id?1:-1)).slice(0,5);
            if(!recent.length) return `<div class="empty" style="padding:10px 0;">No employees yet.</div>`;
            return recent.map(e=>`<div class="kv-row"><span class="k">${e.name}</span><span class="v" style="font-weight:400; color:var(--ink-soft);">${e.department}</span></div>`).join('');
          })()}
        </div>
      </section>
    </div>
  </div>
  `;
}
function statusPill(status){
  const map = { Draft:'status-draft', Calculated:'status-calculated', 'Pending Approval':'status-pending', Approved:'status-approved', Posted:'status-posted', Paid:'status-paid' };
  return `<span class="status-pill ${map[status]||'status-draft'}">${status}</span>`;
}
function openPayRun(id){ ui.view='payruns'; ui.openRunId=id; renderAll(); }

/* =========================================================================
   EMPLOYEES
   ========================================================================= */
function viewEmployees(){
  let list = state.employees.slice();
  if(ui.empFilter) list = list.filter(e=> (e.name+e.empNo+e.department+e.jobTitle).toLowerCase().includes(ui.empFilter.toLowerCase()));
  if(ui.empDeptFilter) list = list.filter(e=>e.department===ui.empDeptFilter);

  return `
  <div class="page-head">
    <div><h1>Employee Records</h1><div class="desc">${state.employees.length} employees on record · foundation for every payroll run</div></div>
    <div class="page-actions">
      <button class="btn" onclick="importEmployees()">Import Excel</button>
      <button class="btn" onclick="exportEmployees()">Export</button>
      <button class="btn btn-primary" onclick="openEmployeeModal()">+ Add Employee</button>
    </div>
  </div>

  <div style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
    <input type="text" placeholder="Search employees…" style="flex:1; min-width:220px; padding:9px 12px; border:1px solid var(--line); border-radius:var(--radius);"
      value="${ui.empFilter}" oninput="ui.empFilter=this.value; renderEmpTable();">
    <select style="padding:9px 12px; border:1px solid var(--line); border-radius:var(--radius);" onchange="ui.empDeptFilter=this.value; renderEmpTable();">
      <option value="">All departments</option>
      ${state.departments.map(d=>`<option value="${d}" ${ui.empDeptFilter===d?'selected':''}>${d}</option>`).join('')}
    </select>
  </div>

  <div id="empTableWrap">${employeeTableHTML(list)}</div>
  `;
}
function employeeTableHTML(list){
  if(!list.length) return `<div class="empty"><div class="big">🧑🏾‍💼</div>No employees match your search.</div>`;
  return `
  <table class="grid">
    <thead><tr><th></th><th>Employee</th><th>Department</th><th>Job Title</th><th class="num">Basic Salary</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>
      ${list.map(e=>`
        <tr>
          <td><input type="checkbox" class="cb"></td>
          <td class="clickable" onclick="openEmployeeModal('${e.id}','view')">
            <div class="row-name">${e.name}</div><div class="row-sub">${e.empNo}</div>
          </td>
          <td>${e.department}</td>
          <td>${e.jobTitle}</td>
          <td class="num">${fmt(e.basicSalary)}</td>
          <td>${statusPill(e.status==='Active'?'Active':'Inactive')}</td>
          <td class="num">
            <button class="btn btn-sm btn-ghost" onclick="openEmployeeModal('${e.id}','view')">View</button>
            <button class="btn btn-sm btn-ghost" onclick="openEmployeeModal('${e.id}','edit')">Edit</button>
            <button class="btn btn-sm btn-ghost" style="color:var(--brick);" onclick="deleteEmployee('${e.id}')">Delete</button>
          </td>
        </tr>`).join('')}
    </tbody>
  </table>`;
}
function renderEmpTable(){
  let list = state.employees.slice();
  if(ui.empFilter) list = list.filter(e=> (e.name+e.empNo+e.department+e.jobTitle).toLowerCase().includes(ui.empFilter.toLowerCase()));
  if(ui.empDeptFilter) list = list.filter(e=>e.department===ui.empDeptFilter);
  document.getElementById('empTableWrap').innerHTML = employeeTableHTML(list);
}
function importEmployees(){ toast('Import from Excel — connect a spreadsheet to bulk-load employees.'); }
function exportEmployees(){ toast('Employee list exported.'); }

let empModalTab='profile';
let empModalMode='edit';
function blankEmp(){
  return { empNo:'EMP-'+String(state.nextEmpSeq).padStart(4,'0'), name:'', department:state.departments[0], jobTitle:state.jobTitles[0],
    employmentDate:todayISO(), basicSalary:0, phone:'', email:'', bankName:'', bankAccount:'', kraPin:'', nssfNo:'', shifNo:'', status:'Active', allowances:[], deductions:[] };
}
function openEmployeeModal(id, mode){
  const emp = id ? state.employees.find(e=>e.id===id) : null;
  empModalTab='profile';
  empModalMode = emp ? (mode||'view') : 'edit';
  window._editingEmpId = emp?emp.id:null;
  window._tmpEmp = JSON.parse(JSON.stringify(emp || blankEmp()));
  renderModal(employeeModalHTML(!!emp));
}
function employeeModalHTML(isExisting){
  const isNew = !isExisting;
  const isView = isExisting && empModalMode==='view';
  const e = window._tmpEmp;
  return `
  <div class="modal wide">
    <div class="modal-head"><h3>${isNew?'Add Employee':isView?'View Employee — '+e.name:'Edit — '+e.name}</h3><button class="x-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="tabs">
        <div class="tab ${empModalTab==='profile'?'active':''}" onclick="switchEmpTab('profile')">Profile</div>
        <div class="tab ${empModalTab==='pay'?'active':''}" onclick="switchEmpTab('pay')">Pay &amp; Bank</div>
        <div class="tab ${empModalTab==='comp'?'active':''}" onclick="switchEmpTab('comp')">Allowances &amp; Deductions</div>
      </div>
      <div id="empTabBody">${empTabBody(empModalTab, e)}</div>
    </div>
    <div class="modal-foot">
      ${!isNew?`<button class="btn btn-danger" style="margin-right:auto" onclick="deleteEmployee('${window._editingEmpId}')">Delete Employee</button>`:''}
      ${isView? `
        <button class="btn" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="empModalMode='edit'; renderModal(employeeModalHTML(true));">Edit Employee</button>
      ` : `
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEmployee('${window._editingEmpId||''}')">Save Employee</button>
      `}
    </div>
  </div>`;
}
function switchEmpTab(tab){
  empModalTab=tab;
  document.getElementById('empTabBody').innerHTML = empTabBody(tab, window._tmpEmp);
  document.querySelectorAll('.tabs .tab').forEach((t,i)=>t.classList.toggle('active', ['profile','pay','comp'][i]===tab));
}
function empTabBody(tab, e){
  const ro = empModalMode==='view';
  const dis = ro ? 'disabled' : '';
  if(tab==='profile'){
    return `
    <div class="form-grid">
      <div class="field"><label>Employee Number</label><input value="${e.empNo}" ${dis} oninput="_tmpEmp.empNo=this.value"></div>
      <div class="field"><label>Full Name</label><input value="${e.name}" placeholder="e.g. Wanjiru Kamau" ${dis} oninput="_tmpEmp.name=this.value"></div>
      <div class="field"><label>Phone</label><input value="${e.phone||''}" placeholder="07XX XXX XXX" ${dis} oninput="_tmpEmp.phone=this.value"></div>
      <div class="field"><label>Email</label><input value="${e.email||''}" ${dis} oninput="_tmpEmp.email=this.value"></div>
      <div class="field"><label>Department</label><select ${dis} onchange="_tmpEmp.department=this.value">${state.departments.map(d=>`<option ${d===e.department?'selected':''}>${d}</option>`).join('')}</select></div>
      <div class="field"><label>Job Title</label><select ${dis} onchange="_tmpEmp.jobTitle=this.value">${state.jobTitles.map(t=>`<option ${t===e.jobTitle?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Employment Date</label><input type="date" value="${e.employmentDate}" ${dis} onchange="_tmpEmp.employmentDate=this.value"></div>
      <div class="field"><label>Status</label><select ${dis} onchange="_tmpEmp.status=this.value"><option ${e.status==='Active'?'selected':''}>Active</option><option ${e.status==='Inactive'?'selected':''}>Inactive</option></select></div>
    </div>`;
  }
  if(tab==='pay'){
    return `
    <div class="form-grid">
      <div class="field"><label>Basic Salary (KES / month)</label><input type="number" value="${e.basicSalary||0}" ${dis} oninput="_tmpEmp.basicSalary=Number(this.value||0)"></div>
      <div class="field"><label>KRA PIN</label><input value="${e.kraPin||''}" ${dis} oninput="_tmpEmp.kraPin=this.value"></div>
      <div class="field"><label>Bank Name</label><input value="${e.bankName||''}" ${dis} oninput="_tmpEmp.bankName=this.value"></div>
      <div class="field"><label>Bank Account No.</label><input value="${e.bankAccount||''}" ${dis} oninput="_tmpEmp.bankAccount=this.value"></div>
      <div class="field"><label>NSSF Number</label><input value="${e.nssfNo||''}" ${dis} oninput="_tmpEmp.nssfNo=this.value"></div>
      <div class="field"><label>SHIF Number</label><input value="${e.shifNo||''}" ${dis} oninput="_tmpEmp.shifNo=this.value"></div>
    </div>
    <div class="hint">Pension is contributed automatically via NSSF at the statutory rate configured under Statutory Taxes.</div>`;
  }
  // comp tab
  if(ro){
    const allowList = (e.allowances||[]).map(a=>`<div class="kv-row"><span class="k">${a.type}</span><span class="v">${fmt(a.amount)}</span></div>`).join('') || '<div class="hint">No recurring allowances.</div>';
    const dedList = (e.deductions||[]).map(d=>`<div class="kv-row"><span class="k">${d.type}</span><span class="v">${fmt(d.amount)}</span></div>`).join('') || '<div class="hint">No voluntary deductions.</div>';
    return `
    <fieldset><legend>Recurring Allowances</legend>${allowList}</fieldset>
    <fieldset><legend>Voluntary Deductions</legend>${dedList}</fieldset>
    <div class="helper-callout">PAYE, NSSF, SHIF and the Housing Levy are calculated automatically at payroll run time.</div>`;
  }
  const allowRows = (e.allowances||[]).map((a,i)=>`
    <div class="field" style="display:flex; gap:8px; align-items:flex-end;">
      <div style="flex:1"><label>${i===0?'Type':''}</label><select onchange="_tmpEmp.allowances[${i}].type=this.value">
        ${state.allowanceTypes.map(t=>`<option ${t===a.type?'selected':''}>${t}</option>`).join('')}</select></div>
      <div style="width:130px"><label>${i===0?'Monthly Amount':''}</label><input type="number" value="${a.amount}" oninput="_tmpEmp.allowances[${i}].amount=Number(this.value||0)"></div>
      <button class="btn btn-sm btn-ghost" onclick="_tmpEmp.allowances.splice(${i},1); switchEmpTab('comp');" style="margin-bottom:1px;">✕</button>
    </div>`).join('');
  const dedRows = (e.deductions||[]).map((d,i)=>`
    <div class="field" style="display:flex; gap:8px; align-items:flex-end;">
      <div style="flex:1"><label>${i===0?'Type':''}</label><select onchange="_tmpEmp.deductions[${i}].type=this.value">
        ${state.deductionTypes.map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}</select></div>
      <div style="width:130px"><label>${i===0?'Monthly Amount':''}</label><input type="number" value="${d.amount}" oninput="_tmpEmp.deductions[${i}].amount=Number(this.value||0)"></div>
      <button class="btn btn-sm btn-ghost" onclick="_tmpEmp.deductions.splice(${i},1); switchEmpTab('comp');" style="margin-bottom:1px;">✕</button>
    </div>`).join('');
  return `
    <fieldset>
      <legend>Recurring Allowances</legend>
      ${allowRows || '<div class="hint">No recurring allowances yet.</div>'}
      <button class="btn btn-sm" style="margin-top:6px;" onclick="_tmpEmp.allowances.push({type:'${state.allowanceTypes[0]}',amount:0}); switchEmpTab('comp');">+ Add Allowance</button>
    </fieldset>
    <fieldset>
      <legend>Voluntary Deductions</legend>
      ${dedRows || '<div class="hint">No voluntary deductions yet.</div>'}
      <button class="btn btn-sm" style="margin-top:6px;" onclick="_tmpEmp.deductions.push({type:'${state.deductionTypes[0]}',amount:0}); switchEmpTab('comp');">+ Add Deduction</button>
    </fieldset>
    <div class="helper-callout">PAYE, NSSF, SHIF and the Housing Levy are calculated automatically at payroll run time — they don't need to be added here.</div>
  `;
}
async function saveEmployee(id){
  const isNew = !id;
  const draft = window._tmpEmp;
  if(!draft.name || !draft.name.trim()){ toast('Please enter the employee name.'); empModalTab='profile'; document.getElementById('empTabBody').innerHTML = empTabBody('profile', draft); document.querySelectorAll('.tabs .tab').forEach((t,i)=>t.classList.toggle('active', i===0)); return; }
  draft.allowances = (draft.allowances||[]).map(a=>({type:a.type, amount:Number(a.amount||0)}));
  draft.deductions = (draft.deductions||[]).map(d=>({type:d.type, amount:Number(d.amount||0)}));

  if(isNew){
    const emp = mkEmp(draft.empNo,'','','','',0,'','','','',[],[]);
    Object.assign(emp, draft, {id: uid('emp')});
    state.employees.push(emp);
    state.nextEmpSeq++;
  }else{
    const emp = state.employees.find(e=>e.id===id);
    Object.assign(emp, draft);
  }
  await saveState();
  closeModal();
  renderAll();
  toast(isNew?'Employee added.':'Employee updated.');
}
async function deleteEmployee(id){
  if(!confirm('Remove this employee from the register?')) return;
  state.employees = state.employees.filter(e=>e.id!==id);
  await saveState();
  closeModal();
  renderAll();
  toast('Employee removed.');
}

/* =========================================================================
   RUN PAYROLL
   ========================================================================= */
function newDraftRun(){
  const now = new Date();
  const period = now.toLocaleString('en-KE',{month:'long', year:'numeric'});
  const activeEmps = state.employees.filter(e=>e.status==='Active');
  return {
    id: uid('run'),
    period,
    payDate: new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().slice(0,10),
    status:'Draft',
    createdAt: Date.now(),
    employeeIds: activeEmps.map(e=>e.id),
    overrides: Object.fromEntries(activeEmps.map(e=>[e.id,{overtime:0,bonus:0,extraDeduction:0}])),
    lines: [],
    totals: { basic:0, allowances:0, overtime:0, bonus:0, gross:0, paye:0, nssf:0, shif:0, housingLevy:0, otherDeductions:0, net:0 }
  };
}
function viewRunPayroll(){
  if(!ui.activeRunDraft) ui.activeRunDraft = newDraftRun();
  const run = ui.activeRunDraft;
  const emps = run.employeeIds.map(id=>state.employees.find(e=>e.id===id)).filter(Boolean);
  const calculated = run.lines && run.lines.length>0;

  return `
  <div class="page-head">
    <div><h1>Gross Pay &amp; Deductions</h1><div class="desc">Review inputs, calculate statutory deductions automatically, then approve.</div></div>
  </div>

  ${flowStrip(run.status)}

  <div class="panel" style="margin-bottom:20px;">
    <div class="form-grid g3">
      <div class="field"><label>Payroll Period</label><input value="${run.period}" onchange="ui.activeRunDraft.period=this.value"></div>
      <div class="field"><label>Pay Date</label><input type="date" value="${run.payDate}" onchange="ui.activeRunDraft.payDate=this.value"></div>
      <div class="field"><label>Employees</label><input value="${emps.length} Employees" disabled></div>
    </div>
    <div class="hint">Overtime, bonus and per-run adjustments can be edited per employee in the table below before you calculate.</div>
  </div>

  <section class="block">
    <h2>Employee Pay Inputs <span class="badge-count">${emps.length}</span></h2>
    <table class="grid">
      <thead><tr><th>Employee</th><th class="num">Basic</th><th class="num">Allowances</th><th class="num">Overtime</th><th class="num">Bonus</th>${calculated?'<th class="num">Gross</th><th class="num">PAYE</th><th class="num">NSSF</th><th class="num">SHIF</th><th class="num">Levy</th><th class="num">Net Pay</th>':''}</tr></thead>
      <tbody>
        ${emps.map(e=>{
          const ov = run.overrides[e.id] || {overtime:0,bonus:0,extraDeduction:0};
          const allowTotal = (e.allowances||[]).reduce((s,a)=>s+Number(a.amount||0),0);
          const line = calculated ? run.lines.find(l=>l.employeeId===e.id) : null;
          return `<tr>
            <td><div class="row-name">${e.name}</div><div class="row-sub">${e.empNo} · ${e.department}</div></td>
            <td class="num">${fmt(e.basicSalary)}</td>
            <td class="num">${fmt(allowTotal)}</td>
            <td class="num"><input type="number" style="width:90px; text-align:right; padding:5px 7px; border:1px solid var(--line); border-radius:2px;" value="${ov.overtime}" ${run.status!=='Draft'?'disabled':''} onchange="ui.activeRunDraft.overrides['${e.id}'].overtime=Number(this.value); ui.activeRunDraft.lines=[]; renderAll();"></td>
            <td class="num"><input type="number" style="width:90px; text-align:right; padding:5px 7px; border:1px solid var(--line); border-radius:2px;" value="${ov.bonus}" ${run.status!=='Draft'?'disabled':''} onchange="ui.activeRunDraft.overrides['${e.id}'].bonus=Number(this.value); ui.activeRunDraft.lines=[]; renderAll();"></td>
            ${calculated?`<td class="num">${fmt(line.gross)}</td><td class="num">${fmt(line.paye)}</td><td class="num">${fmt(line.nssf)}</td><td class="num">${fmt(line.shif)}</td><td class="num">${fmt(line.housingLevy)}</td><td class="num" style="font-weight:700;">${fmt(line.net)}</td>`:''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </section>

  <div class="panel" style="max-width:420px; margin-left:auto;">
    <div class="kv-row"><span class="k">Basic Salary</span><span class="v">${fmtKES(run.totals.basic)}</span></div>
    <div class="kv-row"><span class="k">Allowances</span><span class="v">${fmtKES(run.totals.allowances)}</span></div>
    <div class="kv-row"><span class="k">Overtime &amp; Bonus</span><span class="v">${fmtKES(run.totals.overtime+run.totals.bonus)}</span></div>
    <div class="kv-row total"><span class="k">Gross Pay</span><span class="v">${fmtKES(run.totals.gross)}</span></div>
    <div class="divider-label">Deductions</div>
    <div class="kv-row"><span class="k">PAYE</span><span class="v">${fmtKES(run.totals.paye)}</span></div>
    <div class="kv-row"><span class="k">NSSF</span><span class="v">${fmtKES(run.totals.nssf)}</span></div>
    <div class="kv-row"><span class="k">SHIF</span><span class="v">${fmtKES(run.totals.shif)}</span></div>
    <div class="kv-row"><span class="k">Housing Levy</span><span class="v">${fmtKES(run.totals.housingLevy)}</span></div>
    <div class="kv-row"><span class="k">Other Deductions</span><span class="v">${fmtKES(run.totals.otherDeductions)}</span></div>
    <div class="kv-row total"><span class="k">Net Pay</span><span class="v">${fmtKES(run.totals.net)}</span></div>
  </div>

  <div class="page-actions" style="margin-top:20px; justify-content:flex-end; display:flex;">
    <button class="btn" onclick="discardDraft()">Discard</button>
    <button class="btn btn-gold" onclick="calculateRun()" ${emps.length===0?'disabled':''}>Calculate</button>
    <button class="btn btn-primary" onclick="approveRun()" ${!calculated?'disabled':''}>Approve Payroll</button>
  </div>
  `;
}
function flowStrip(status){
  const steps = ['Draft','Calculated','Pending Approval','Approved','Posted','Paid'];
  const idx = steps.indexOf(status);
  return `<div class="flow-strip">${steps.map((s,i)=>`<span class="flow-step ${i<idx?'done':i===idx?'current':''}">${s}</span>${i<steps.length-1?'<span class="flow-arrow">→</span>':''}`).join('')}</div>`;
}
function calculateRun(){
  const run = ui.activeRunDraft;
  const emps = run.employeeIds.map(id=>state.employees.find(e=>e.id===id)).filter(Boolean);
  run.lines = emps.map(e=>computeEmployeeLine(e, run.overrides[e.id], state.statutory));
  run.totals = sumRun(run.lines);
  run.status = 'Calculated';
  renderAll();
  toast('Payroll calculated for '+emps.length+' employees.');
}
function discardDraft(){
  if(!confirm('Discard this draft payroll run?')) return;
  ui.activeRunDraft = newDraftRun();
  renderAll();
}
async function approveRun(){
  const run = ui.activeRunDraft;
  run.status = 'Pending Approval';
  renderAll();
  setTimeout(async ()=>{
    run.status = 'Approved';
    state.payRuns.push(run);
    ui.activeRunDraft = null;
    await saveState();
    renderAll();
    toast('Payroll approved and added to Pay Runs.');
    goTo('payruns');
  }, 350);
}

/* =========================================================================
   PAY RUNS
   ========================================================================= */
function viewPayRuns(){
  const runs = [...state.payRuns].sort((a,b)=>b.createdAt-a.createdAt);
  const openId = ui.openRunId || (runs[0] && runs[0].id);
  const open = runs.find(r=>r.id===openId);
  return `
  <div class="page-head"><div><h1>Pay Runs</h1><div class="desc">Approved payroll history and posting status.</div></div>
    <div class="page-actions"><button class="btn btn-primary" onclick="goTo('runpayroll')">+ Run Payroll</button></div>
  </div>
  ${!runs.length? `<div class="empty"><div class="big">🗂️</div>No approved payroll runs yet.</div>` : `
  <div style="display:grid; grid-template-columns:280px 1fr; gap:18px; align-items:start;">
    <table class="grid">
      <thead><tr><th>Period</th><th>Status</th></tr></thead>
      <tbody>
        ${runs.map(r=>`<tr class="clickable" onclick="ui.openRunId='${r.id}'; renderAll();" style="${r.id===openId?'background:var(--paper-alt);':''}">
          <td class="row-name">${r.period}</td><td>${statusPill(r.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div>${open ? payRunDetailHTML(open) : ''}</div>
  </div>`}
  `;
}
function payRunDetailHTML(run){
  return `
  <div class="panel">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
      <div><h3 style="margin:0 0 4px;">${run.period}</h3><div class="desc" style="color:var(--ink-soft); font-size:12.5px;">Pay date ${run.payDate} · ${run.employeeIds.length} employees</div></div>
      ${statusPill(run.status)}
    </div>
    ${flowStrip(run.status)}
    <div class="page-actions" style="margin-bottom:16px;">
      ${run.status==='Approved'?`<button class="btn btn-gold" onclick="postRun('${run.id}')">Post to Ledger</button>`:''}
      ${run.status==='Posted'?`<button class="btn btn-primary" onclick="markPaid('${run.id}')">Mark as Paid</button>`:''}
      <button class="btn" onclick="ui.reportSel='register'; ui.payslipRunId='${run.id}'; goTo('reports')">View Register</button>
      <button class="btn" onclick="ui.payslipRunId='${run.id}'; goTo('payslips')">View Payslips</button>
      <button class="btn btn-danger" onclick="deleteRun('${run.id}')">Delete Run</button>
    </div>
    <table class="grid">
      <thead><tr><th>Employee</th><th class="num">Gross</th><th class="num">PAYE</th><th class="num">NSSF</th><th class="num">SHIF</th><th class="num">Levy</th><th class="num">Net Pay</th></tr></thead>
      <tbody>
        ${run.lines.map(l=>`<tr><td class="row-name">${l.name}</td><td class="num">${fmt(l.gross)}</td><td class="num">${fmt(l.paye)}</td><td class="num">${fmt(l.nssf)}</td><td class="num">${fmt(l.shif)}</td><td class="num">${fmt(l.housingLevy)}</td><td class="num" style="font-weight:700;">${fmt(l.net)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr style="font-weight:700; background:var(--paper-alt);"><td>Total</td><td class="num">${fmt(run.totals.gross)}</td><td class="num">${fmt(run.totals.paye)}</td><td class="num">${fmt(run.totals.nssf)}</td><td class="num">${fmt(run.totals.shif)}</td><td class="num">${fmt(run.totals.housingLevy)}</td><td class="num">${fmt(run.totals.net)}</td></tr></tfoot>
    </table>
  </div>`;
}
async function postRun(id){
  const run = state.payRuns.find(r=>r.id===id);
  run.status='Posted'; run.postedAt=Date.now();
  await saveState(); renderAll();
  toast('Payroll posted to the general ledger.');
}
async function markPaid(id){
  const run = state.payRuns.find(r=>r.id===id);
  run.status='Paid'; run.paidAt=Date.now();
  await saveState(); renderAll();
  toast('Salaries marked as paid.');
}
async function deleteRun(id){
  const run = state.payRuns.find(r=>r.id===id);
  const warn = (run.status==='Posted'||run.status==='Paid') ? ' This run has already been '+run.status.toLowerCase()+' — deleting it will not reverse ledger or bank entries.' : '';
  if(!confirm('Delete the '+run.period+' payroll run?'+warn)) return;
  state.payRuns = state.payRuns.filter(r=>r.id!==id);
  if(ui.openRunId===id) ui.openRunId = null;
  await saveState(); renderAll();
  toast('Payroll run deleted.');
}

/* =========================================================================
   PAYSLIPS
   ========================================================================= */
function viewPayslips(){
  const runs = [...state.payRuns].sort((a,b)=>b.createdAt-a.createdAt);
  if(!runs.length) return `<div class="page-head"><h1>Payslip Generation</h1></div><div class="empty"><div class="big">🧾</div>Payslips appear here once a payroll run is approved.</div>`;
  const runId = ui.payslipRunId && runs.find(r=>r.id===ui.payslipRunId) ? ui.payslipRunId : runs[0].id;
  ui.payslipRunId = runId;
  const run = runs.find(r=>r.id===runId);
  const empId = ui.payslipEmpId && run.lines.find(l=>l.employeeId===ui.payslipEmpId) ? ui.payslipEmpId : run.lines[0].employeeId;
  ui.payslipEmpId = empId;
  const line = run.lines.find(l=>l.employeeId===empId);
  const emp = state.employees.find(e=>e.id===empId);

  return `
  <div class="page-head no-print"><div><h1>Payslip Generation</h1><div class="desc">Individual payslips generated from an approved payroll run.</div></div></div>

  <div style="display:flex; gap:10px; margin-bottom:20px;" class="no-print">
    <select style="padding:8px 12px; border:1px solid var(--line); border-radius:var(--radius);" onchange="ui.payslipRunId=this.value; ui.payslipEmpId=null; renderAll();">
      ${runs.map(r=>`<option value="${r.id}" ${r.id===runId?'selected':''}>${r.period}</option>`).join('')}
    </select>
    <select style="padding:8px 12px; border:1px solid var(--line); border-radius:var(--radius); flex:1;" onchange="ui.payslipEmpId=this.value; renderAll();">
      ${run.lines.map(l=>`<option value="${l.employeeId}" ${l.employeeId===empId?'selected':''}>${l.name} — ${l.empNo}</option>`).join('')}
    </select>
  </div>

  <div class="payslip">
    <div class="ps-head"><div class="co">${state.company.logoText}</div><div class="ttl">PAYSLIP</div></div>
    <div class="ps-meta">
      <div><span class="k">Employee</span>${emp.name}</div>
      <div><span class="k">Employee No.</span>${emp.empNo}</div>
      <div><span class="k">Department</span>${emp.department}</div>
      <div><span class="k">Period</span>${run.period}</div>
      <div><span class="k">KRA PIN</span>${emp.kraPin}</div>
      <div><span class="k">Bank A/C</span>${emp.bankAccount||'—'}</div>
    </div>

    <div class="ps-section-title">Earnings</div>
    <div class="ps-line"><span>Basic Salary</span><span class="mono">${fmt(line.basic)}</span></div>
    ${line.allowancesDetail.map(a=>`<div class="ps-line"><span>${a.type} Allowance</span><span class="mono">${fmt(a.amount)}</span></div>`).join('')}
    ${line.overtime?`<div class="ps-line"><span>Overtime</span><span class="mono">${fmt(line.overtime)}</span></div>`:''}
    ${line.bonus?`<div class="ps-line"><span>Bonus</span><span class="mono">${fmt(line.bonus)}</span></div>`:''}
    <div class="ps-line sum"><span>Gross Pay</span><span class="mono">${fmt(line.gross)}</span></div>

    <div class="ps-section-title">Deductions</div>
    <div class="ps-line"><span>PAYE</span><span class="mono">${fmt(line.paye)}</span></div>
    <div class="ps-line"><span>NSSF</span><span class="mono">${fmt(line.nssf)}</span></div>
    <div class="ps-line"><span>SHIF</span><span class="mono">${fmt(line.shif)}</span></div>
    <div class="ps-line"><span>Housing Levy</span><span class="mono">${fmt(line.housingLevy)}</span></div>
    ${line.otherDeductionsDetail.map(d=>`<div class="ps-line"><span>${d.type}</span><span class="mono">${fmt(d.amount)}</span></div>`).join('')}
    <div class="ps-line sum"><span>Total Deductions</span><span class="mono">${fmt(line.totalDeductions)}</span></div>

    <div class="ps-net"><span class="l">Net Pay</span><span class="v mono">${fmtKES(line.net)}</span></div>
    <div class="hint" style="margin-top:10px; text-align:center;">Payment Date: ${run.payDate}</div>
  </div>

  <div style="text-align:center; margin-top:18px;" class="no-print">
    <button class="btn" onclick="window.print()">Print</button>
    <button class="btn btn-primary" onclick="window.print()">Download PDF</button>
  </div>
  `;
}

/* =========================================================================
   ALLOWANCES / DEDUCTIONS CONFIG
   ========================================================================= */
function viewAllowances(){
  return `
  <div class="page-head"><div><h1>Earnings &amp; Allowances</h1><div class="desc">Configure allowance types available across the organisation. Assign amounts per employee from their profile.</div></div>
    <div class="page-actions"><button class="btn" onclick="goTo('deductions')">Deduction Types →</button><button class="btn btn-primary" onclick="addTypeInline('allowanceTypes')">+ Add Allowance Type</button></div>
  </div>
  <div class="panel"><div class="chiplist">
    ${state.allowanceTypes.map((t,i)=>`<div class="chip">${t}<button onclick="renameType('allowanceTypes',${i})" title="Rename">✎</button><button onclick="removeType('allowanceTypes',${i})" title="Delete">✕</button></div>`).join('')}
  </div></div>
  <section class="block" style="margin-top:24px;">
    <h2>Allowances by Employee</h2>
    <table class="grid"><thead><tr><th>Employee</th><th>Allowances</th><th class="num">Monthly Total</th></tr></thead>
    <tbody>
    ${state.employees.filter(e=>e.allowances&&e.allowances.length).map(e=>`
      <tr><td class="row-name">${e.name}</td><td>${e.allowances.map(a=>`${a.type} (${fmt(a.amount)})`).join(', ')}</td>
      <td class="num">${fmt(e.allowances.reduce((s,a)=>s+Number(a.amount),0))}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">No allowances assigned yet.</td></tr>`}
    </tbody></table>
  </section>`;
}
function viewDeductions(){
  return `
  <div class="page-head"><div><h1>Deductions</h1><div class="desc">Statutory deductions (PAYE, NSSF, SHIF, Housing Levy) are calculated automatically at payroll run time. Voluntary deductions are configured per employee.</div></div>
    <div class="page-actions"><button class="btn btn-primary" onclick="addTypeInline('deductionTypes')">+ Add Deduction Type</button></div>
  </div>

  <section class="block">
    <h2>Statutory — Calculated Automatically</h2>
    <table class="grid"><thead><tr><th>Deduction</th><th>Basis</th><th class="num">Current Rate</th></tr></thead>
      <tbody>
        <tr><td class="row-name">PAYE</td><td>Progressive bands on taxable pay</td><td class="num">10%–35%</td></tr>
        <tr><td class="row-name">NSSF</td><td>Tier I &amp; II on pensionable pay</td><td class="num">${(state.statutory.nssfRate*100).toFixed(1)}%</td></tr>
        <tr><td class="row-name">SHIF</td><td>Gross pay, min ${fmt(state.statutory.shifMin)}</td><td class="num">${(state.statutory.shifRate*100).toFixed(2)}%</td></tr>
        <tr><td class="row-name">Housing Levy</td><td>Gross pay</td><td class="num">${(state.statutory.housingLevyRate*100).toFixed(1)}%</td></tr>
      </tbody></table>
    <div style="margin-top:10px;"><button class="btn btn-sm" onclick="goTo('taxes')">Edit statutory rates →</button></div>
  </section>

  <section class="block">
    <h2>Voluntary Deduction Types</h2>
    <div class="panel"><div class="chiplist">
      ${state.deductionTypes.map((t,i)=>`<div class="chip">${t}<button onclick="renameType('deductionTypes',${i})" title="Rename">✎</button><button onclick="removeType('deductionTypes',${i})" title="Delete">✕</button></div>`).join('')}
    </div></div>
  </section>

  <section class="block">
    <h2>Deductions by Employee</h2>
    <table class="grid"><thead><tr><th>Employee</th><th>Voluntary Deductions</th><th class="num">Monthly Total</th></tr></thead>
    <tbody>
    ${state.employees.filter(e=>e.deductions&&e.deductions.length).map(e=>`
      <tr><td class="row-name">${e.name}</td><td>${e.deductions.map(d=>`${d.type} (${fmt(d.amount)})`).join(', ')}</td>
      <td class="num">${fmt(e.deductions.reduce((s,d)=>s+Number(d.amount),0))}</td></tr>`).join('') || `<tr><td colspan="3" class="empty">No voluntary deductions assigned yet.</td></tr>`}
    </tbody></table>
  </section>`;
}
async function addTypeInline(key){
  const labels = { allowanceTypes:'allowance type', deductionTypes:'deduction type', departments:'department', jobTitles:'job title' };
  const val = prompt('New '+(labels[key]||'item')+' name:');
  if(!val || !val.trim()) return;
  state[key].push(val.trim());
  await saveState(); renderAll();
  toast('Added.');
}
async function renameType(key, idx){
  const oldVal = state[key][idx];
  const val = prompt('Rename to:', oldVal);
  if(!val || !val.trim() || val.trim()===oldVal) return;
  const newVal = val.trim();
  state[key][idx] = newVal;
  if(key==='departments') state.employees.forEach(e=>{ if(e.department===oldVal) e.department=newVal; });
  if(key==='jobTitles') state.employees.forEach(e=>{ if(e.jobTitle===oldVal) e.jobTitle=newVal; });
  if(key==='allowanceTypes') state.employees.forEach(e=>(e.allowances||[]).forEach(a=>{ if(a.type===oldVal) a.type=newVal; }));
  if(key==='deductionTypes') state.employees.forEach(e=>(e.deductions||[]).forEach(d=>{ if(d.type===oldVal) d.type=newVal; }));
  await saveState(); renderAll();
  toast('Renamed.');
}
async function removeType(key, idx){
  if(!confirm('Remove this '+(key==='departments'?'department':key==='jobTitles'?'job title':key==='allowanceTypes'?'allowance type':'deduction type')+'? Employees already assigned it keep the existing value.')) return;
  state[key].splice(idx,1);
  await saveState(); renderAll();
  toast('Removed.');
}

/* =========================================================================
   STATUTORY TAXES
   ========================================================================= */
function viewTaxes(){
  const s = state.statutory;
  return `
  <div class="page-head"><div><h1>Statutory Deductions</h1><div class="desc">These configurable rules drive the automatic payroll calculation engine. Update when KRA, NSSF or SHIF regulations change.</div></div></div>

  <section class="block">
    <h2>PAYE — Monthly Tax Bands</h2>
    <table class="grid"><thead><tr><th>Band up to (KES)</th><th class="num">Rate</th><th></th></tr></thead>
      <tbody>
        ${s.payeBands.map((b,i)=>`<tr>
          <td><input type="number" value="${b.upTo===null?'':b.upTo}" placeholder="No limit" style="width:140px; padding:6px 8px; border:1px solid var(--line); border-radius:2px;" onchange="state.statutory.payeBands[${i}].upTo=this.value===''?null:Number(this.value); saveState();"></td>
          <td class="num"><input type="number" value="${(b.rate*100)}" style="width:80px; padding:6px 8px; border:1px solid var(--line); border-radius:2px; text-align:right;" onchange="state.statutory.payeBands[${i}].rate=Number(this.value)/100; saveState();"> %</td>
          <td class="num">${s.payeBands.length>1?`<button class="btn btn-sm btn-ghost" onclick="state.statutory.payeBands.splice(${i},1); saveState(); goTo('taxes');">✕</button>`:''}</td>
        </tr>`).join('')}
      </tbody></table>
    <div style="margin-top:8px; display:flex; gap:10px; align-items:center;">
      <button class="btn btn-sm" onclick="state.statutory.payeBands.splice(state.statutory.payeBands.length-1,0,{upTo:0,rate:0}); saveState(); goTo('taxes');">+ Add Band</button>
      <div class="field" style="margin:0; display:flex; align-items:center; gap:8px;"><label style="margin:0;">Personal Relief (KES/mo)</label>
        <input type="number" value="${s.personalRelief}" style="width:100px; padding:6px 8px; border:1px solid var(--line); border-radius:2px;" onchange="state.statutory.personalRelief=Number(this.value); saveState();"></div>
    </div>
  </section>

  <section class="block">
    <h2>NSSF</h2>
    <div class="form-grid g3">
      <div class="field"><label>Tier I Limit (KES)</label><input type="number" value="${s.nssfTier1Limit}" onchange="state.statutory.nssfTier1Limit=Number(this.value); saveState();"></div>
      <div class="field"><label>Tier II Limit (KES)</label><input type="number" value="${s.nssfTier2Limit}" onchange="state.statutory.nssfTier2Limit=Number(this.value); saveState();"></div>
      <div class="field"><label>Contribution Rate (%)</label><input type="number" value="${s.nssfRate*100}" onchange="state.statutory.nssfRate=Number(this.value)/100; saveState();"></div>
    </div>
  </section>

  <section class="block">
    <h2>SHIF</h2>
    <div class="form-grid">
      <div class="field"><label>Rate (%)</label><input type="number" step="0.01" value="${s.shifRate*100}" onchange="state.statutory.shifRate=Number(this.value)/100; saveState();"></div>
      <div class="field"><label>Minimum Contribution (KES)</label><input type="number" value="${s.shifMin}" onchange="state.statutory.shifMin=Number(this.value); saveState();"></div>
    </div>
  </section>

  <section class="block">
    <h2>Affordable Housing Levy</h2>
    <div class="form-grid">
      <div class="field"><label>Employee Rate (%)</label><input type="number" step="0.1" value="${s.housingLevyRate*100}" onchange="state.statutory.housingLevyRate=Number(this.value)/100; saveState();"></div>
    </div>
  </section>
  <div class="helper-callout">Changes apply to the next payroll calculation. Existing approved or posted pay runs are not recalculated.</div>
  `;
}

/* =========================================================================
   REPORTS
   ========================================================================= */
const REPORT_DEFS = [
  {id:'summary', t:'Payroll Summary', d:'Totals for a selected pay run'},
  {id:'register', t:'Payroll Register', d:'Full employee-level breakdown'},
  {id:'paye', t:'PAYE Report', d:'Tax remittance by employee'},
  {id:'nssf', t:'NSSF Report', d:'Pension contributions by employee'},
  {id:'shif', t:'SHIF Report', d:'Health insurance contributions'},
  {id:'levy', t:'Housing Levy Report', d:'Affordable housing levy by employee'},
  {id:'deductions', t:'Deduction Report', d:'Voluntary deductions by employee'},
  {id:'allowances', t:'Allowance Report', d:'Allowances paid by employee'},
  {id:'department', t:'Department Payroll', d:'Cost by department'},
  {id:'expense', t:'Salary Expense Report', d:'Gross cost to company'},
  {id:'liability', t:'Payroll Liability Report', d:'Statutory amounts owed'},
  {id:'journal', t:'Payroll Journal', d:'Debit / credit posting entries'},
  {id:'payment', t:'Payroll Payment Report', d:'Net pay by bank / run'},
];
function viewReports(){
  const runs = [...state.payRuns].sort((a,b)=>b.createdAt-a.createdAt);
  if(!runs.length) return `<div class="page-head"><h1>Payroll Summary Reports</h1></div><div class="empty"><div class="big">📊</div>Reports become available once you have approved payroll runs.</div>`;
  const runId = ui.payslipRunId && runs.find(r=>r.id===ui.payslipRunId) ? ui.payslipRunId : runs[0].id;
  const run = runs.find(r=>r.id===runId);
  return `
  <div class="page-head no-print"><div><h1>Payroll Summary Reports</h1><div class="desc">Generated from approved payroll runs.</div></div>
    <select style="padding:8px 12px; border:1px solid var(--line); border-radius:var(--radius);" onchange="ui.payslipRunId=this.value; renderAll();">
      ${runs.map(r=>`<option value="${r.id}" ${r.id===runId?'selected':''}>${r.period}</option>`).join('')}
    </select>
  </div>
  <div class="report-tiles no-print">
    ${REPORT_DEFS.map(r=>`<div class="report-tile ${ui.reportSel===r.id?'active':''}" onclick="ui.reportSel='${r.id}'; renderAll();"><div class="t">${r.t}</div><div class="d">${r.d}</div></div>`).join('')}
  </div>
  <div class="panel">${renderReportBody(ui.reportSel||'summary', run)}
    <div style="margin-top:14px; text-align:right;" class="no-print"><button class="btn" onclick="window.print()">Print / Export</button></div>
  </div>`;
}
function lineItemTable(run, title, valueKey, detailFn){
  const rows = run.lines.map(l=>`<tr><td class="row-name">${l.name}</td><td>${l.department}</td><td class="num">${fmt(l[valueKey])}</td></tr>`).join('');
  const total = run.lines.reduce((s,l)=>s+l[valueKey],0);
  return `<h3 style="margin-top:0;">${title} — ${run.period}</h3>
  <table class="grid"><thead><tr><th>Employee</th><th>Department</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr style="font-weight:700; background:var(--paper-alt);"><td colspan="2">Total</td><td class="num">${fmt(total)}</td></tr></tfoot></table>`;
}
function renderReportBody(id, run){
  if(id==='summary'){
    const t = run.totals;
    return `<h3 style="margin-top:0;">Payroll Summary — ${run.period}</h3>
    <div class="kv-row"><span class="k">Employees</span><span class="v">${run.employeeIds.length}</span></div>
    <div class="kv-row"><span class="k">Basic Salary</span><span class="v">${fmtKES(t.basic)}</span></div>
    <div class="kv-row"><span class="k">Allowances</span><span class="v">${fmtKES(t.allowances)}</span></div>
    <div class="kv-row"><span class="k">Overtime &amp; Bonus</span><span class="v">${fmtKES(t.overtime+t.bonus)}</span></div>
    <div class="kv-row total"><span class="k">Gross Pay</span><span class="v">${fmtKES(t.gross)}</span></div>
    <div class="kv-row"><span class="k">PAYE</span><span class="v">${fmtKES(t.paye)}</span></div>
    <div class="kv-row"><span class="k">NSSF</span><span class="v">${fmtKES(t.nssf)}</span></div>
    <div class="kv-row"><span class="k">SHIF</span><span class="v">${fmtKES(t.shif)}</span></div>
    <div class="kv-row"><span class="k">Housing Levy</span><span class="v">${fmtKES(t.housingLevy)}</span></div>
    <div class="kv-row"><span class="k">Other Deductions</span><span class="v">${fmtKES(t.otherDeductions)}</span></div>
    <div class="kv-row total"><span class="k">Net Pay</span><span class="v">${fmtKES(t.net)}</span></div>`;
  }
  if(id==='register') return payRunDetailHTML(run).replace('<div class="panel">','').slice(0,-6);
  if(id==='paye') return lineItemTable(run,'PAYE Report','paye');
  if(id==='nssf') return lineItemTable(run,'NSSF Report','nssf');
  if(id==='shif') return lineItemTable(run,'SHIF Report','shif');
  if(id==='levy') return lineItemTable(run,'Housing Levy Report','housingLevy');
  if(id==='deductions') return lineItemTable(run,'Deduction Report (voluntary)','otherDeductions');
  if(id==='allowances') return lineItemTable(run,'Allowance Report','allowancesTotal');
  if(id==='expense') return lineItemTable(run,'Salary Expense Report','gross');
  if(id==='payment') return `<h3 style="margin-top:0;">Payroll Payment Report — ${run.period}</h3>
    <table class="grid"><thead><tr><th>Employee</th><th>Bank</th><th>Account No.</th><th class="num">Net Pay</th></tr></thead>
    <tbody>${run.lines.map(l=>{const e=state.employees.find(x=>x.id===l.employeeId)||{}; return `<tr><td class="row-name">${l.name}</td><td>${e.bankName||'—'}</td><td>${e.bankAccount||'—'}</td><td class="num">${fmt(l.net)}</td></tr>`}).join('')}</tbody>
    <tfoot><tr style="font-weight:700; background:var(--paper-alt);"><td colspan="3">Total Net Pay</td><td class="num">${fmt(run.totals.net)}</td></tr></tfoot></table>`;
  if(id==='department'){
    const depts = {};
    run.lines.forEach(l=>{ depts[l.department] = depts[l.department]||{count:0,gross:0,net:0}; depts[l.department].count++; depts[l.department].gross+=l.gross; depts[l.department].net+=l.net; });
    return `<h3 style="margin-top:0;">Department Payroll — ${run.period}</h3>
    <table class="grid"><thead><tr><th>Department</th><th class="num">Employees</th><th class="num">Gross</th><th class="num">Net</th></tr></thead>
    <tbody>${Object.entries(depts).map(([d,v])=>`<tr><td class="row-name">${d}</td><td class="num">${v.count}</td><td class="num">${fmt(v.gross)}</td><td class="num">${fmt(v.net)}</td></tr>`).join('')}</tbody></table>`;
  }
  if(id==='liability'){
    const t = run.totals;
    return `<h3 style="margin-top:0;">Payroll Liability Report — ${run.period}</h3>
    <table class="grid"><thead><tr><th>Liability</th><th>Payable Account</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr><td class="row-name">PAYE</td><td>${state.payAccounts.payePayable}</td><td class="num">${fmt(t.paye)}</td></tr>
      <tr><td class="row-name">NSSF (employee + employer)</td><td>${state.payAccounts.nssfPayable}</td><td class="num">${fmt(t.nssf*2)}</td></tr>
      <tr><td class="row-name">SHIF</td><td>${state.payAccounts.shifPayable}</td><td class="num">${fmt(t.shif)}</td></tr>
      <tr><td class="row-name">Housing Levy (employee + employer)</td><td>${state.payAccounts.otherPayable}</td><td class="num">${fmt(t.housingLevy*2)}</td></tr>
      <tr><td class="row-name">Net Salaries</td><td>${state.payAccounts.netPayable}</td><td class="num">${fmt(t.net)}</td></tr>
    </tbody></table>`;
  }
  if(id==='journal'){
    const t = run.totals;
    const employerNssf = t.nssf, employerLevy = t.housingLevy;
    const statutoryExpense = employerNssf + employerLevy;
    return `<h3 style="margin-top:0;">Payroll Journal — ${run.period}</h3>
    <div class="hint" style="margin-bottom:10px;">Posted automatically when a pay run status changes to Posted.</div>
    <table class="grid"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
    <tbody>
      <tr><td class="row-name">${state.payAccounts.salaryExpense}</td><td class="num">${fmt(t.gross)}</td><td class="num">—</td></tr>
      <tr><td class="row-name">${state.payAccounts.statutoryExpense}</td><td class="num">${fmt(statutoryExpense)}</td><td class="num">—</td></tr>
      <tr><td>&nbsp;&nbsp;${state.payAccounts.payePayable}</td><td class="num">—</td><td class="num">${fmt(t.paye)}</td></tr>
      <tr><td>&nbsp;&nbsp;${state.payAccounts.nssfPayable}</td><td class="num">—</td><td class="num">${fmt(t.nssf*2)}</td></tr>
      <tr><td>&nbsp;&nbsp;${state.payAccounts.shifPayable}</td><td class="num">—</td><td class="num">${fmt(t.shif)}</td></tr>
      <tr><td>&nbsp;&nbsp;${state.payAccounts.otherPayable}</td><td class="num">—</td><td class="num">${fmt(t.housingLevy*2)}</td></tr>
      <tr><td>&nbsp;&nbsp;${state.payAccounts.netPayable}</td><td class="num">—</td><td class="num">${fmt(t.net)}</td></tr>
    </tbody>
    <tfoot><tr style="font-weight:700; background:var(--paper-alt);"><td>Total</td><td class="num">${fmt(t.gross+statutoryExpense)}</td><td class="num">${fmt(t.paye+t.nssf*2+t.shif+t.housingLevy*2+t.net)}</td></tr></tfoot></table>
    <div class="ps-section-title" style="margin-top:18px;">On Payment</div>
    <table class="grid"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
    <tbody><tr><td class="row-name">${state.payAccounts.netPayable}</td><td class="num">${fmt(t.net)}</td><td class="num">—</td></tr>
    <tr><td class="row-name">${state.payAccounts.bank}</td><td class="num">—</td><td class="num">${fmt(t.net)}</td></tr></tbody></table>`;
  }
  return '';
}

/* =========================================================================
   SETTINGS
   ========================================================================= */
const SETTINGS_TABS = [
  {id:'company', t:'Company'}, {id:'departments', t:'Departments'}, {id:'jobtitles', t:'Job Titles'},
  {id:'workflow', t:'Approval Workflow'}, {id:'accounts', t:'Payroll Accounts'}, {id:'bank', t:'Bank Payment Settings'},
];
function viewSettings(){
  return `
  <div class="page-head"><h1>Payroll Settings</h1></div>
  <div class="settings-nav">${SETTINGS_TABS.map(t=>`<button class="${ui.settingsTab===t.id?'active':''}" onclick="ui.settingsTab='${t.id}'; renderAll();">${t.t}</button>`).join('')}</div>
  <div class="panel">${settingsBody(ui.settingsTab)}</div>
  `;
}
function settingsBody(tab){
  const c = state.company;
  if(tab==='company'){
    return `<div class="form-grid">
      <div class="field"><label>Company Name</label><input value="${c.name}" onchange="state.company.name=this.value; saveState();"></div>
      <div class="field"><label>Currency</label><input value="${c.currency}" onchange="state.company.currency=this.value; saveState();"></div>
      <div class="field"><label>KRA PIN</label><input value="${c.kraPin}" onchange="state.company.kraPin=this.value; saveState();"></div>
      <div class="field"><label>Payslip Logo Text</label><input value="${c.logoText}" onchange="state.company.logoText=this.value; saveState();"></div>
      <div class="field" style="grid-column:1/-1;"><label>Address</label><input value="${c.address}" onchange="state.company.address=this.value; saveState();"></div>
    </div>`;
  }
  if(tab==='departments'){
    return `<div class="chiplist">${state.departments.map((d,i)=>`<div class="chip">${d}<button onclick="renameType('departments',${i})" title="Rename">✎</button><button onclick="removeType('departments',${i})" title="Delete">✕</button></div>`).join('')}</div>
    <button class="btn btn-sm" style="margin-top:12px;" onclick="addTypeInline('departments')">+ Add Department</button>`;
  }
  if(tab==='jobtitles'){
    return `<div class="chiplist">${state.jobTitles.map((d,i)=>`<div class="chip">${d}<button onclick="renameType('jobTitles',${i})" title="Rename">✎</button><button onclick="removeType('jobTitles',${i})" title="Delete">✕</button></div>`).join('')}</div>
    <button class="btn btn-sm" style="margin-top:12px;" onclick="addTypeInline('jobTitles')">+ Add Job Title</button>`;
  }
  if(tab==='workflow'){
    return flowStrip('Approved') + `<div class="hint">Draft → Calculated → Pending Approval → Approved → Posted → Paid. Approved payroll cannot be edited — a new draft must be created for corrections.</div>`;
  }
  if(tab==='accounts'){
    const a = state.payAccounts;
    return `<div class="form-grid">
      ${Object.keys(a).map(k=>`<div class="field"><label>${k.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</label><input value="${a[k]}" onchange="state.payAccounts['${k}']=this.value; saveState();"></div>`).join('')}
    </div>`;
  }
  if(tab==='bank'){
    const b = state.bankSettings;
    return `<div class="form-grid">
      <div class="field"><label>Bank Name</label><input value="${b.bankName}" onchange="state.bankSettings.bankName=this.value; saveState();"></div>
      <div class="field"><label>Account Number</label><input value="${b.accountNo}" onchange="state.bankSettings.accountNo=this.value; saveState();"></div>
      <div class="field"><label>Payment Method</label><input value="${b.paymentMethod}" onchange="state.bankSettings.paymentMethod=this.value; saveState();"></div>
    </div>`;
  }
  return '';
}

/* =========================================================================
   MODAL HELPERS
   ========================================================================= */
function renderModal(html){ document.getElementById('modalRoot').innerHTML = `<div class="modal-overlay" onclick="if(event.target===this) closeModal();">${html}</div>`; }
function closeModal(){ document.getElementById('modalRoot').innerHTML=''; }

/* =========================================================================
   BOOT
   ========================================================================= */
const THEME_KEY = 'acacia-payroll-theme';
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const icon = theme==='dark' ? '☀️' : '🌙';
  const a = document.getElementById('themeToggleBtn'); if(a) a.textContent = icon;
  const b = document.getElementById('authThemeToggleBtn'); if(b) b.textContent = icon;
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current==='dark' ? 'light' : 'dark';
  applyTheme(next);
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){ /* ignore */ }
}
function initTheme(){
  let saved = 'light';
  try{ saved = localStorage.getItem(THEME_KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }catch(e){}
  applyTheme(saved);
}
initTheme();

async function boot(){
  const session = await getSession();
  if(session && session.companyId){
    await enterApp(session);
  }else{
    hpShowHome();
  }
}
boot();


/* ---------------------------- Attendance & Leave (mirrors Books module) ---------------------------- */
const ATT_TYPES=['Present','Sick Leave','Annual Leave','Unpaid Leave','Absent'];
ui.attEdit=-1; ui.attQ=''; ui.attFrom=''; ui.attTo='';
function attRows(){
  const q=(ui.attQ||'').toLowerCase();
  return (state.attendance||[]).map((r,i)=>({...r,i})).filter(r=>{
    const e=state.employees.find(x=>x.id===r.empId)||{};
    if(ui.attFrom && r.date<ui.attFrom) return false;
    if(ui.attTo && r.date>ui.attTo) return false;
    return !q || [e.name,e.empNo,r.type,r.note,r.date].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>b.date.localeCompare(a.date));
}
function viewAttendance(){
  const rows=attRows(), ed=ui.attEdit>=0?state.attendance[ui.attEdit]:null;
  const opt=(v,sel)=>`<option ${v===sel?'selected':''}>${v}</option>`;
  const bal=state.employees.map(e=>{
    const mine=rows.filter(r=>r.empId===e.id), sum=t=>mine.filter(r=>r.type===t).reduce((s,r)=>s+Number(r.days||0),0);
    const used=sum('Annual Leave');
    return `<tr><td>${e.empNo}</td><td class="row-name">${e.name}</td><td class="num">${sum('Present')}</td><td class="num">${sum('Sick Leave')}</td><td class="num">${used}</td><td class="num">${Math.max(0,21-used)}</td><td class="num">${sum('Unpaid Leave')}</td><td class="num">${sum('Absent')}</td></tr>`;
  }).join('')||'<tr><td colspan="8" class="empty">Add employees first.</td></tr>';
  return `
  <div class="page-head"><div><h1>Attendance &amp; Leave</h1><div class="desc">Record attendance and leave. Unpaid leave and absences feed payroll deductions.</div></div>
    <div class="page-actions"><button class="btn" onclick="exportAttendanceCSV()">Export CSV</button><button class="btn" onclick="resetAttendance()">Reset</button></div></div>
  <div class="panel"><div class="form-grid">
    <div class="field"><label>Employee</label><select id="attEmp"><option value="">Select Employee</option>${state.employees.map(e=>`<option value="${e.id}" ${ed&&ed.empId===e.id?'selected':''}>${e.name} (${e.empNo})</option>`).join('')}</select></div>
    <div class="field"><label>Date</label><input type="date" id="attDate" value="${ed?ed.date:todayISO()}"></div>
    <div class="field"><label>Type</label><select id="attType">${ATT_TYPES.map(t=>opt(t,ed&&ed.type)).join('')}</select></div>
    <div class="field"><label>Days</label><input type="number" id="attDays" step="0.5" min="0" max="21" value="${ed?ed.days:1}"></div>
    <div class="field"><label>Notes (optional)</label><input id="attNote" value="${ed?ed.note||'':''}"></div>
  </div><div style="margin-top:12px"><button class="btn btn-primary" onclick="saveAttendance()">${ed?'Update':'Save'} Attendance</button>${ed?' <button class="btn" onclick="ui.attEdit=-1;renderAll()">Cancel Edit</button>':''}</div></div>
  <section class="block" style="margin-top:24px"><h2>Leave Balance Summary</h2>
    <div class="desc">Reflects the date range below (or all records). Annual leave is out of 21 days per year.</div>
    <table class="grid"><thead><tr><th>ID</th><th>Name</th><th class="num">Present</th><th class="num">Sick</th><th class="num">Annual Used</th><th class="num">Annual Left</th><th class="num">Unpaid</th><th class="num">Absent</th></tr></thead><tbody>${bal}</tbody></table></section>
  <section class="block" style="margin-top:24px"><h2>Attendance Records</h2>
    <div class="form-grid" style="margin-bottom:12px">
      <div class="field"><label>Search</label><input value="${ui.attQ||''}" placeholder="Search attendance..." oninput="ui.attQ=this.value;attRefresh(this)"></div>
      <div class="field"><label>From</label><input type="date" value="${ui.attFrom||''}" onchange="ui.attFrom=this.value;renderAll()"></div>
      <div class="field"><label>To</label><input type="date" value="${ui.attTo||''}" onchange="ui.attTo=this.value;renderAll()"></div></div>
    <table class="grid"><thead><tr><th>Date</th><th>Employee</th><th>Type</th><th class="num">Days</th><th>Notes</th><th></th></tr></thead><tbody>
    ${rows.map(r=>{const e=state.employees.find(x=>x.id===r.empId)||{name:'(deleted)'};return `<tr><td>${r.date}</td><td class="row-name">${e.name}</td><td>${r.type}</td><td class="num">${r.days}</td><td>${r.note||''}</td><td><button class="btn" onclick="ui.attEdit=${r.i};renderAll()">Edit</button> <button class="btn" onclick="deleteAttendance(${r.i})">Delete</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No attendance recorded.</td></tr>'}
    </tbody></table></section>`;
}
function attRefresh(el){ const pos=el.selectionStart; renderAll(); const n=document.querySelector('#view input[placeholder="Search attendance..."]'); if(n){n.focus();n.setSelectionRange(pos,pos);} }
async function saveAttendance(){
  const g=id=>document.getElementById(id).value, empId=g('attEmp'), date=g('attDate');
  if(!empId||!date){ toast('Select an employee and date.'); return; }
  const rec={empId,date,type:g('attType'),days:Number(g('attDays')||0),note:g('attNote')};
  if(ui.attEdit>=0) state.attendance[ui.attEdit]=rec; else state.attendance.push(rec);
  ui.attEdit=-1; await saveState(); renderAll(); toast('Attendance saved.');
}
async function deleteAttendance(i){ if(!confirm('Delete this record?')) return; state.attendance.splice(i,1); await saveState(); renderAll(); }
async function resetAttendance(){ if(!confirm('Delete ALL attendance records?')) return; state.attendance=[]; await saveState(); renderAll(); }
function exportAttendanceCSV(){
  const lines=['Employee No,Name,Date,Type,Days,Notes'].concat(attRows().map(r=>{const e=state.employees.find(x=>x.id===r.empId)||{};return [e.empNo,e.name,r.date,r.type,r.days,r.note||''].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')}));
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download='attendance.csv'; a.click();
}

/* ---------------------------- Integrations: Bank Integration (mirrors Books module) ---------------------------- */
const KE_BANKS=['Equity Bank Kenya','KCB Bank Kenya','Co-operative Bank of Kenya','Absa Bank Kenya','NCBA Bank Kenya','Standard Chartered Bank Kenya','I&M Bank','Diamond Trust Bank (DTB) Kenya','Stanbic Bank Kenya','Family Bank','Prime Bank Kenya','Citi Bank Kenya','Bank of Africa Kenya','Sidian Bank','Gulf African Bank','Credit Bank Kenya','Other / SACCO'];
function viewIntegrations(){
  const linked=state.employees.filter(e=>e.bankName||e.bankAccount);
  return `
  <div class="page-head"><div><h1>Bank Integration</h1><div class="desc">Employee bank accounts used for salary payments and the bank payment file.</div></div></div>
  <div class="panel"><h3>Add / Edit Employee Bank Account</h3><div class="form-grid">
    <div class="field"><label>Employee</label><select id="bkEmp" onchange="bankFill()"><option value="">Select Employee</option>${state.employees.map(e=>`<option value="${e.id}">${e.name} (${e.empNo})</option>`).join('')}</select></div>
    <div class="field"><label>Bank / SACCO</label><select id="bkName"><option value="">Select Bank/SACCO</option>${KE_BANKS.map(b=>`<option>${b}</option>`).join('')}</select></div>
    <div class="field"><label>Account Number</label><input id="bkAcct" placeholder="Account number"></div>
  </div><div style="margin-top:12px"><button class="btn btn-primary" onclick="saveBank()">Save Bank Account</button></div></div>
  <section class="block" style="margin-top:24px"><h2>Employee Bank Accounts</h2>
    <table class="grid"><thead><tr><th>ID</th><th>Employee</th><th>Bank</th><th>Account No.</th><th></th></tr></thead><tbody>
    ${linked.map(e=>`<tr><td>${e.empNo}</td><td class="row-name">${e.name}</td><td>${e.bankName||''}</td><td>${e.bankAccount||''}</td><td><button class="btn" onclick="bankEdit('${e.id}')">Edit</button> <button class="btn" onclick="bankClear('${e.id}')">Remove</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No bank accounts saved yet.</td></tr>'}
    </tbody></table></section>`;
}
function bankFill(){ const e=state.employees.find(x=>x.id===document.getElementById('bkEmp').value)||{}; document.getElementById('bkName').value=KE_BANKS.includes(e.bankName)?e.bankName:''; document.getElementById('bkAcct').value=e.bankAccount||''; }
function bankEdit(id){ document.getElementById('bkEmp').value=id; bankFill(); window.scrollTo(0,0); }
async function saveBank(){
  const e=state.employees.find(x=>x.id===document.getElementById('bkEmp').value);
  if(!e){ toast('Select an employee.'); return; }
  e.bankName=document.getElementById('bkName').value; e.bankAccount=document.getElementById('bkAcct').value.trim();
  await saveState(); renderAll(); toast('Bank account saved.');
}
async function bankClear(id){ const e=state.employees.find(x=>x.id===id); if(e&&confirm('Remove bank details?')){ e.bankName=''; e.bankAccount=''; await saveState(); renderAll(); } }
