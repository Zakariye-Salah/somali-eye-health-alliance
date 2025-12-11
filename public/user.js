/* user.js — core UI/auth helpers (improved, backoff-aware) */

/* CONFIG */
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
? 'http://localhost:4000' 
: 'https://somali-eye-health-alliance.onrender.com';

/* Global backoff state (shared with help widget) */
window.__seha_backoffUntil = window.__seha_backoffUntil || 0;
window.__seha_backoffFactor = window.__seha_backoffFactor || 1;

/* lightweight selectors + safe DOM helpers */
const qs = s => document.querySelector(s);
const el = id => document.getElementById(id);

function get(id) { return el(id); }
function has(id) { return Boolean(get(id)); }
function on(idOrNode, evt, handler, options) {
  const node = (typeof idOrNode === 'string') ? get(idOrNode) : idOrNode;
  if (!node) return null;
  node.addEventListener(evt, handler, options);
  return node;
}
function setText(id, txt) { const n = get(id); if (!n) return; n.textContent = txt; }
function setHtml(id, html) { const n = get(id); if (!n) return; n.innerHTML = html; }
function toggleClass(id, cls, force) { const n = get(id); if (!n) return; if (typeof force === 'boolean') n.classList.toggle(cls, force); else n.classList.toggle(cls); }
function addClass(id, cls) { const n = get(id); if (!n) return; n.classList.add(cls); }
function removeClass(id, cls) { const n = get(id); if (!n) return; n.classList.remove(cls); }
function setVal(id, value) { const n = get(id); if (!n) return; n.value = value; }
function getVal(id) { const n = get(id); if (!n) return null; return n.value; }
function q(sel) { try { return document.querySelector(sel); } catch(e) { return null; } }

/* Auth storage helpers */
function setToken(token) { if (token) localStorage.setItem('seha_token', token); else localStorage.removeItem('seha_token'); }
function getToken(){ return localStorage.getItem('seha_token'); }
function setUser(u){ if(u) localStorage.setItem('seha_user', JSON.stringify(u)); else localStorage.removeItem('seha_user'); }
function getUser(){ try { return JSON.parse(localStorage.getItem('seha_user')) } catch(e){ return null } }

/* safe auth headers builder (calls getToken each time) */
function authHeaders() {
  const t = getToken();
  return t ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t } : { 'Content-Type': 'application/json' };
}



/* ====== Mobile menu toggles (defensive) ====== */
(function mobileMenuInit() {
  const hamb = get('hambBtn'), mobileMenu = get('mobileMenu');
  if (hamb && mobileMenu) {
    on(hamb, 'click', () => {
      const expanded = hamb.getAttribute('aria-expanded') === 'true';
      hamb.setAttribute('aria-expanded', String(!expanded));
      mobileMenu.classList.toggle('hidden');
    });
  }

  // mobile-toggle elements (may not exist on all pages)
  document.querySelectorAll('.mobile-toggle').forEach(btn => {
    on(btn, 'click', (e) => {
      e.preventDefault();
      const t = btn.dataset.target;
      const sub = document.getElementById(t);
      if (!sub) return;
      const shown = sub.classList.contains('show');
      sub.classList.toggle('show');
      const sym = btn.querySelector('.toggle-symbol');
      if (sym) sym.textContent = shown ? '+' : '-';
      sub.setAttribute('aria-hidden', String(shown));
    });
  });
})();

/* ====== UI refresh + role-aware toggles ====== *//* --- improved refreshAuthUI (replace existing) --- */
async function refreshAuthUI() {
  const token = getToken();
  const localUser = getUser();
  const logged = Boolean(token);

  // Defensive toggles (may not exist on page)
  try { if (el('editProfileBtn')) el('editProfileBtn').classList.toggle('hidden', !logged); } catch(e){}
  try { if (el('loginBtn')) el('loginBtn').classList.toggle('hidden', logged); } catch(e){}
  try { if (el('logoutBtn')) el('logoutBtn').classList.toggle('hidden', !logged); } catch(e){}
  try { if (el('mobileEditProfileBtn')) el('mobileEditProfileBtn').classList.toggle('hidden', !logged); } catch(e){}
  try { if (el('mobileLoginBtn')) el('mobileLoginBtn').classList.toggle('hidden', logged); } catch(e){}
  try { if (el('mobileLogoutBtn')) el('mobileLogoutBtn').classList.toggle('hidden', !logged); } catch(e){}
  try { if (el('pageLogoutBtn')) el('pageLogoutBtn').classList.toggle('hidden', !logged); } catch(e){}

  try { if (el('summaryName')) el('summaryName').textContent = (localUser && localUser.fullName) ? localUser.fullName : 'Not signed in'; } catch(e){}
  try { if (el('summaryEmail')) el('summaryEmail').textContent = (localUser && localUser.email) ? localUser.email : '—'; } catch(e){}
  try { if (el('signedStatus')) el('signedStatus').textContent = logged ? 'Signed in' : 'Signed out'; } catch(e){}

  try { if (el('manageBtn')) el('manageBtn').classList.add('hidden'); } catch(e){}

  // pre-fill modal fields if present
  if (localUser && logged) {
    try { if (el('modalFullName')) el('modalFullName').value = localUser.fullName || ''; } catch(e){}
    try { if (el('modalEmail')) el('modalEmail').value = localUser.email || ''; } catch(e){}
  } else {
    try { if (el('modalFullName')) el('modalFullName').value = ''; } catch(e){}
    try { if (el('modalEmail')) el('modalEmail').value = ''; } catch(e){}
  }

  // one-time server validate if token present (respect backoff)
  if (token) {
    // if we are currently backed off, skip validation to avoid hammering the API
    if (window.__seha_backoffUntil && Date.now() < window.__seha_backoffUntil) {
      console.warn('refreshAuthUI: skipping auth check due to backoff until', new Date(window.__seha_backoffUntil).toISOString());
      return;
    }

    try {
      const resp = await fetch((API_BASE || '') + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
      if (resp.ok) {
        const data = await resp.json();
        const u = data.user || data;
        setUser(u);
        if (u.role === 'admin' || u.role === 'superadmin') {
          try { if (el('manageBtn')) el('manageBtn').classList.remove('hidden'); } catch(e){}
        } else {
          try { if (el('manageBtn')) el('manageBtn').classList.add('hidden'); } catch(e){}
        }
        try { if (el('summaryName')) el('summaryName').textContent = u.fullName || 'Signed in'; } catch(e){}
        try { if (el('summaryEmail')) el('summaryEmail').textContent = u.email || '—'; } catch(e){}
        try { if (el('signedStatus')) el('signedStatus').textContent = 'Signed in'; } catch(e){}
        try { if (el('pageLogoutBtn')) el('pageLogoutBtn').classList.remove('hidden'); } catch(e){}
      } else {
        // handle error statuses
        if (resp.status === 401 || resp.status === 403) {
          // invalid token -> clear local storage
          setToken(null); setUser(null);
          try { if (el('summaryName')) el('summaryName').textContent = 'Not signed in'; } catch(e){}
          try { if (el('summaryEmail')) el('summaryEmail').textContent = '—'; } catch(e){}
          try { if (el('signedStatus')) el('signedStatus').textContent = 'Signed out'; } catch(e){}
          try { if (el('manageBtn')) el('manageBtn').classList.add('hidden'); } catch(e){}
          try { if (el('editProfileBtn')) el('editProfileBtn').classList.add('hidden'); } catch(e){}
          try { if (el('logoutBtn')) el('logoutBtn').classList.add('hidden'); } catch(e){}
          try { if (el('loginBtn')) el('loginBtn').classList.remove('hidden'); } catch(e){}
          try { if (el('pageLogoutBtn')) el('pageLogoutBtn').classList.add('hidden'); } catch(e){}
        } else if (resp.status === 429) {
          // server side rate limit -- set backoff using Retry-After when available
          const ra = resp.headers.get('Retry-After');
          const retryAfter = parseInt(ra,10) || 5;
          window.__seha_backoffUntil = Date.now() + (retryAfter * 1000);
          console.warn('Auth check returned 429: backing off for', retryAfter, 's');
        } else {
          console.warn('Auth check returned non-401/429:', resp.status);
        }
      }
    } catch (err) {
      console.warn('Auth validation network error', err);
    }
  }
}


/* ========== Modal helpers (defensive) ========== */
function openModal(backdropId, focusSelector){
  const bd = get(backdropId);
  if(!bd) return;
  bd.classList.add('show'); bd.setAttribute('aria-hidden','false');
  const input = bd.querySelector(focusSelector);
  setTimeout(()=>{ if(input) input.focus(); }, 40);
  document.addEventListener('keydown', trapEscape);
}
function closeModal(backdropId){
  const bd = get(backdropId);
  if(!bd) return;
  bd.classList.remove('show'); bd.setAttribute('aria-hidden','true');
  document.removeEventListener('keydown', trapEscape);
}
function trapEscape(e){
  if(e.key === 'Escape'){
    ['loginModalBackdrop','editModalBackdrop','manageModalBackdrop','addUserBackdrop','editUserBackdrop'].forEach(id => {
      try { closeModal(id); } catch(e) {}
    });
  }
}

/* ========== Wire modal open/close triggers (defensive) ========== */
// login/edit from header/menu (use on which is safe)
on('loginBtn','click', () => openModal('loginModalBackdrop','#modalLoginUsername'));
on('mobileLoginBtn','click', () => openModal('loginModalBackdrop','#modalLoginUsername'));
on('openLoginFromPage','click', () => openModal('loginModalBackdrop','#modalLoginUsername'));

on('editProfileBtn','click', () => {
  if(!getToken()) { openModal('loginModalBackdrop','#modalLoginUsername'); return; }
  openModal('editModalBackdrop','#modalFullName');
});
on('mobileEditProfileBtn','click', () => {
  if(!getToken()) { openModal('loginModalBackdrop','#modalLoginUsername'); return; }
  openModal('editModalBackdrop','#modalFullName');
});
on('openEditFromPage','click', () => {
  if(!getToken()) { openModal('loginModalBackdrop','#modalLoginUsername'); return; }
  openModal('editModalBackdrop','#modalFullName');
});

on('pageLogoutBtn','click', () => { setToken(null); setUser(null); refreshAuthUI(); if (has('loginMsg')) setText('loginMsg','Logged out.'); });

['loginModalClose','modalCancelLogin','editModalClose','modalCancelEdit'].forEach(id => {
  const node = get(id);
  if(!node) return;
  node.addEventListener('click', (ev) => {
    if(id.includes('Login')) closeModal('loginModalBackdrop'); else if (id.includes('Edit')) closeModal('editModalBackdrop');
  });
});

['loginModalBackdrop','editModalBackdrop'].forEach(bid => {
  const bd = get(bid);
  if(!bd) return;
  bd.addEventListener('click', (ev) => { if(ev.target === bd) closeModal(bid); });
});

/* ========== LOGIN modal submit (defensive) ========== */
const modalLoginForm = get('modalLoginForm');
if (modalLoginForm) {
  modalLoginForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const u = getVal('modalLoginUsername') ? getVal('modalLoginUsername').trim() : '';
    const p = getVal('modalLoginPassword') || '';
    const msgEl = get('modalLoginMsg');
    if (msgEl) msgEl.textContent = '';
    if (has('modalDoLoginBtn')) get('modalDoLoginBtn').disabled = true;
    try {
      const resp = await fetch((API_BASE || '') + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: u, password: p })
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (msgEl) msgEl.innerHTML = '<span class="error">' + (data.message || (data.errors && data.errors.map(x=>x.msg).join(', ')) || 'Login failed') + '</span>';
      } else {
        setToken(data.token);
        setUser(data.user || {});
        if (msgEl) msgEl.innerHTML = '<span class="success">Logged in.</span>';
        await refreshAuthUI();
        setTimeout(()=>{ closeModal('loginModalBackdrop'); if (has('modalLoginMsg')) get('modalLoginMsg').textContent = ''; }, 500);
      }
    } catch (err) {
      console.error(err);
      if (msgEl) msgEl.innerHTML = '<span class="error">Network error</span>';
    } finally { if (has('modalDoLoginBtn')) get('modalDoLoginBtn').disabled = false; }
  });
}

/* ========== EDIT profile submit (defensive) ========== */
const modalEditForm = get('modalEditForm');
if (modalEditForm) {
  modalEditForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const msgEl = get('modalEditMsg'); if (msgEl) msgEl.textContent = '';
    const token = getToken();
    if(!token){ if (msgEl) msgEl.innerHTML = '<span class="error">You must be logged in.</span>'; return; }
    const payload = {
      fullName: getVal('modalFullName') ? getVal('modalFullName').trim() : undefined,
      email: getVal('modalEmail') ? getVal('modalEmail').trim() || undefined : undefined,
      password: getVal('modalPassword') || undefined
    };
    if (has('modalSaveProfileBtn')) get('modalSaveProfileBtn').disabled = true;
    try {
      const resp = await fetch((API_BASE || '') + '/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if(!resp.ok) {
        const errMsg = data.message || (data.errors && data.errors.map(x=>x.msg).join(', ')) || 'Update failed';
        if (msgEl) msgEl.innerHTML = '<span class="error">' + errMsg + '</span>';
      } else {
        const newUser = data.user || data;
        setUser(newUser);
        if (msgEl) msgEl.innerHTML = '<span class="success">Profile saved.</span>';
        await refreshAuthUI();
        setTimeout(()=>{ closeModal('editModalBackdrop'); if (has('modalEditMsg')) get('modalEditMsg').textContent = ''; }, 700);
      }
    } catch(err){
      console.error(err);
      if (msgEl) msgEl.innerHTML = '<span class="error">Network error</span>';
    } finally { if (has('modalSaveProfileBtn')) get('modalSaveProfileBtn').disabled = false; }
  });
}

/* ========== Header account actions (safe) ========== */
on('loginBtn','click', ()=> openModal('loginModalBackdrop','#modalLoginUsername'));
on('logoutBtn','click', ()=> { setToken(null); setUser(null); refreshAuthUI(); });
on('editProfileBtn','click', ()=> {
  if(!getToken()) openModal('loginModalBackdrop','#modalLoginUsername'); else openModal('editModalBackdrop','#modalFullName');
});

on('mobileLoginBtn','click', ()=> openModal('loginModalBackdrop','#modalLoginUsername'));
on('mobileLogoutBtn','click', ()=> { setToken(null); setUser(null); refreshAuthUI(); });
on('mobileEditProfileBtn','click', ()=> {
  if(!getToken()) openModal('loginModalBackdrop','#modalLoginUsername'); else openModal('editModalBackdrop','#modalFullName');
});

/* ========== LANGUAGE sync (safe) ========== */
function applyLanguage(lang) {
  localStorage.setItem('seha_lang', lang);
  ['langSelect','mobileLangSelect','sidebarLang'].forEach(id => { const s = get(id); if(s) s.value = lang; });
  const strings = {
    en:{ home:'Home', about:'About Us', who:'Who we are', what:'What we do', framework:'Operational framework',
         team:'Team & governance', programs:'Programs', resources:'Resources', contact:'Contact', donate:'Donate',
         edit_profile:'Edit profile', login:'Login', logout:'Logout', lang:'Language' },
    so:{ home:'Bogga Hore', about:'Nagu Saabsan', who:'Kuwa aan nahay', what:'Waxaan qabanno', framework:'Qaabka shaqo',
         team:'Kooxda & maamulka', programs:'Barnaamijyo', resources:'Khayraad', contact:'Nala soo xiriir', donate:'Deeq',
         edit_profile:'Tafatir Profile', login:'Gali', logout:'Ka bax', lang:'Luuqad' }
  };
  const map = strings[lang] || strings.en;
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.getAttribute('data-i18n');
    if(key && map[key]) node.textContent = map[key];
  });
}
['langSelect','mobileLangSelect','sidebarLang'].forEach(id=>{
  const s = get(id); if(!s) return; s.addEventListener('change', () => applyLanguage(s.value));
});


(function(){
  const THEME_KEY = 'seha_theme';

  function getSavedTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return (v === 'dark' || v === 'light') ? v : 'system';
    } catch (e) { return 'system'; }
  }
  function saveTheme(v) {
    try {
      if (!v || v === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, v);
    } catch (e) {}
  }

  function applyTheme(mode) {
    const html = document.documentElement;
    if (!html) return;
    // remove explicit classes — system should not leave any
    html.classList.remove('dark','light');

    if (mode === 'dark') {
      html.classList.add('dark');
    } else if (mode === 'light') {
      html.classList.add('light');
    } else {
      // system -> leave no explicit class so @media prefers-color-scheme applies
    }

    // optional: update theme-color meta tag for mobile browsers
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    // choose an appropriate color from CSS variables if present
    const computed = getComputedStyle(document.documentElement);
    const card = computed.getPropertyValue('--card') || '#ffffff';
    const bg = computed.getPropertyValue('--bg') || '#ffffff';
    meta.content = (mode === 'dark') ? (computed.getPropertyValue('--card') || '#071427').trim() : (computed.getPropertyValue('--bg') || '#f7f8fa').trim();
  }

  function syncSelects(mode) {
    ['themeSelect','mobileThemeSelect','sidebarTheme'].forEach(id => {
      const n = document.getElementById(id);
      if (n && n.value !== mode) { try { n.value = mode; } catch(e){} }
    });
  }

  function onSelectChange(e) {
    const v = (e.target && e.target.value) ? e.target.value : 'system';
    saveTheme(v);
    applyTheme(v);
    syncSelects(v);
  }

  function initThemeControls() {
    const saved = getSavedTheme();
    // apply initial
    applyTheme(saved);
    syncSelects(saved);

    // wire selects
    ['themeSelect','mobileThemeSelect','sidebarTheme'].forEach(id => {
      const n = document.getElementById(id);
      if (!n) return;
      // set to saved (defensive)
      try { n.value = saved; } catch(e){}
      n.addEventListener('change', onSelectChange);
    });

    // respond to OS color scheme changes ONLY when user chooses 'system'
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) {
      const mqHandler = () => {
        if (getSavedTheme() === 'system') {
          applyTheme('system');
          syncSelects('system');
        }
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', mqHandler);
      else if (typeof mq.addListener === 'function') mq.addListener(mqHandler);
    }

    // expose quick API for debugging
    window.__seha_theme = {
      get: getSavedTheme,
      set: (m) => { saveTheme(m); applyTheme(m); syncSelects(m); }
    };
  }

  // init after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeControls);
  } else {
    initThemeControls();
  }
})();

   
/***********************
* ADMIN / MANAGE USERS
***********************/

// open manage modal -> fetch and render users (defensive)
on('manageBtn','click', async () => {
  const user = getUser();
  if(!user || !getToken()) { openModal('loginModalBackdrop','#modalLoginUsername'); return; }
  // Only admin & superadmin allowed in UI; server enforces as well
  if(!(user.role === 'admin' || user.role === 'superadmin')) {
    alert('Access denied.');
    return;
  }
  // show/hide Add user based on role (admin & superadmin see it, admin will be restricted from creating superadmin on form)
  if (has('addUserBtn')) removeClass('addUserBtn','hidden'); // ensure visible
  // disable option superadmin for admins
  const roleSelect = get('addRole');
  if(roleSelect) {
    if(user.role === 'admin') {
      if(roleSelect.querySelector('option[value="superadmin"]')) roleSelect.querySelector('option[value="superadmin"]').disabled = true;
    } else {
      if(roleSelect.querySelector('option[value="superadmin"]')) roleSelect.querySelector('option[value="superadmin"]').disabled = false;
    }
  }
  // open modal
  openModal('manageModalBackdrop','#userSearch');
  await loadUsers(); // fetch users when opening
});

// close manage modal (safe)
on('manageModalClose','click', ()=> closeModal('manageModalBackdrop'));
on('addUserClose','click', ()=> closeModal('addUserBackdrop'));
on('addUserCancel','click', ()=> closeModal('addUserBackdrop'));
on('editUserClose','click', ()=> closeModal('editUserBackdrop'));
on('editUserCancel','click', ()=> closeModal('editUserBackdrop'));

// search filter (safe)
const userSearch = get('userSearch');
if (userSearch) userSearch.addEventListener('input', (e)=> renderUsers(currentUsers, e.target.value.trim()));

let currentUsers = []; // cached list

async function loadUsers() {
  if (has('manageMsg')) setText('manageMsg', 'Loading...');
  try {
    const resp = await fetch((API_BASE || '') + '/api/admin/users', { headers: authHeaders() });
    const data = await resp.json();
    if (!resp.ok) {
      if (has('manageMsg')) setHtml('manageMsg', '<span class="error">' + (data.message || 'Failed to load users') + '</span>');
      currentUsers = [];
      renderUsers([]);
      return;
    }
    currentUsers = data.users || [];
    if (has('manageMsg')) setText('manageMsg','');
    renderUsers(currentUsers);
  } catch (err) {
    console.error(err);
    if (has('manageMsg')) setHtml('manageMsg','<span class="error">Network error</span>');
  }
}

// render user rows (safe)
function renderUsers(users, filter='') {
  const tbody = get('usersTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const actor = getUser() || {};
  const f = (filter || '').toLowerCase();
  const list = users.filter(u => {
    if(!f) return true;
    return (u.username || '').toLowerCase().includes(f) || (u.fullName || '').toLowerCase().includes(f) || (u.email||'').toLowerCase().includes(f);
  });
  if(list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">No users found</td></tr>';
    return;
  }
  list.forEach(u => {
    const tr = document.createElement('tr');

    const created = new Date(u.createdAt || Date.now());
    const createdText = created.toLocaleDateString();

    tr.innerHTML = `
      <td>${escapeHtml(u.fullName || '')}</td>
      <td>${escapeHtml(u.username || '')}</td>
      <td>${escapeHtml(u.email || '—')}</td>
      <td><span class="role-chip">${escapeHtml(u.role || 'user')}</span></td>
      <td>${createdText}</td>
      <td></td>
    `;
    // actions cell
    const actionsTd = tr.querySelector('td:last-child');

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn edit';
    editBtn.title = 'Edit user';
    editBtn.innerHTML = '✎';
    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn del';
    delBtn.title = 'Delete user';
    delBtn.innerHTML = '🗑';

    // Decide permissions:
    const actorRole = actor.role || 'user';
    const targetRole = u.role || 'user';
    const isSelf = (actor._id && actor._id.toString && u._id && actor._id.toString() === u._id.toString()) || false;

    // edit allowed?
    let canEdit = false;
    if (actorRole === 'superadmin') canEdit = true;
    else if (actorRole === 'admin' && targetRole === 'user') canEdit = true;

    // delete allowed?
    let canDelete = false;
    if (actorRole === 'superadmin') canDelete = (actor._id?.toString() !== u._id?.toString());
    else if (actorRole === 'admin' && targetRole === 'user') canDelete = (actor._id?.toString() !== u._id?.toString());

    if (!canEdit) editBtn.disabled = true;
    if (!canDelete) delBtn.disabled = true;

    // attach events
    editBtn.addEventListener('click', (ev) => {
      if (editBtn.disabled) return;
      openEditUserModal(u);
    });
    delBtn.addEventListener('click', (ev) => {
      if (delBtn.disabled) return;
      if (!confirm(`Delete user "${u.username}"? This action cannot be undone.`)) return;
      deleteUser(u._id);
    });

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(delBtn);

    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, function(m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

/* ========== ADD user flow (defensive) ========== */
on('addUserBtn','click', () => {
  const actor = getUser() || {};
  if(!(actor.role === 'admin' || actor.role === 'superadmin')) { alert('Access denied'); return; }
  const roleSel = get('addRole');
  if(roleSel) {
    if(actor.role === 'admin') {
      if(roleSel.querySelector('option[value="superadmin"]')) roleSel.querySelector('option[value="superadmin"]').disabled = true;
    } else {
      if(roleSel.querySelector('option[value="superadmin"]')) roleSel.querySelector('option[value="superadmin"]').disabled = false;
    }
  }
  if (has('addFullName')) setVal('addFullName','');
  if (has('addUsername')) setVal('addUsername','');
  if (has('addEmail')) setVal('addEmail','');
  if (has('addPassword')) setVal('addPassword','');
  if (has('addUserMsg')) setText('addUserMsg','');
  openModal('addUserBackdrop','#addFullName');
});

const addUserForm = get('addUserForm');
if (addUserForm) {
  addUserForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const actor = getUser() || {};
    if(!(actor.role === 'admin' || actor.role === 'superadmin')) { if (has('addUserMsg')) setHtml('addUserMsg','<span class="error">Permission denied</span>'); return; }
    const payload = {
      fullName: getVal('addFullName') ? getVal('addFullName').trim() : '',
      username: getVal('addUsername') ? getVal('addUsername').trim() : '',
      email: getVal('addEmail') ? getVal('addEmail').trim() || undefined : undefined,
      password: getVal('addPassword') || '',
      role: getVal('addRole') || 'user'
    };
    if(actor.role === 'admin' && payload.role === 'superadmin') {
      if (has('addUserMsg')) setHtml('addUserMsg','<span class="error">Admins cannot create superadmin</span>'); return;
    }
    if (has('addUserMsg')) setText('addUserMsg','Creating...');
    try {
      const resp = await fetch((API_BASE || '') + '/api/admin/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if(!resp.ok) {
        if (has('addUserMsg')) setHtml('addUserMsg','<span class="error">' + (data.message || (data.errors && data.errors.map(x=>x.msg).join(', ')) || 'Create failed') + '</span>');
      } else {
        if (has('addUserMsg')) setHtml('addUserMsg','<span class="success">User created</span>');
        await loadUsers();
        setTimeout(()=>{ closeModal('addUserBackdrop'); }, 500);
      }
    } catch(err) {
      console.error(err);
      if (has('addUserMsg')) setHtml('addUserMsg','<span class="error">Network error</span>');
    }
  });
}

/* ========== Edit user modal & save (defensive) ========== */
function openEditUserModal(u) {
  const actor = getUser() || {};
  if(actor.role === 'admin' && u.role !== 'user') { alert('Admins can only edit normal users'); return; }
  if (has('editUserId')) setVal('editUserId', u._id);
  if (has('editFullName')) setVal('editFullName', u.fullName || '');
  if (has('editEmail')) setVal('editEmail', u.email || '');
  if (has('editPassword')) setVal('editPassword', '');
  const roleSel = get('editRole');
  if (roleSel) {
    if(actor.role === 'admin') {
      const opt = roleSel.querySelector('option[value="superadmin"]');
      if (opt) opt.disabled = true;
    } else {
      const opt = roleSel.querySelector('option[value="superadmin"]');
      if (opt) opt.disabled = false;
    }
    roleSel.value = u.role || 'user';
  }
  if (has('editUserMsg')) setText('editUserMsg','');
  openModal('editUserBackdrop','#editFullName');
}

const editUserForm = get('editUserForm');
if (editUserForm) {
  editUserForm.addEventListener('submit', async function(e){
    e.preventDefault();
    const actor = getUser() || {};
    const id = getVal('editUserId');
    if(!id) return;
    const payload = {
      fullName: getVal('editFullName') ? getVal('editFullName').trim() || undefined : undefined,
      email: getVal('editEmail') ? getVal('editEmail').trim() || undefined : undefined,
      password: getVal('editPassword') || undefined,
      role: getVal('editRole') || undefined
    };
    if(actor.role === 'admin' && payload.role === 'superadmin') {
      if (has('editUserMsg')) setHtml('editUserMsg','<span class="error">Admins cannot assign superadmin role</span>'); return;
    }
    if (has('editUserSave')) get('editUserSave').disabled = true;
    if (has('editUserMsg')) setText('editUserMsg','Saving...');
    try {
      const resp = await fetch((API_BASE || '') + '/api/admin/users/' + id, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if(!resp.ok) {
        if (has('editUserMsg')) setHtml('editUserMsg','<span class="error">' + (data.message || (data.errors && data.errors.map(x=>x.msg).join(', ')) || 'Update failed') + '</span>');
      } else {
        if (has('editUserMsg')) setHtml('editUserMsg','<span class="success">Saved</span>');
        await loadUsers();
        setTimeout(()=>{ closeModal('editUserBackdrop'); }, 600);
      }
    } catch(err) {
      console.error(err);
      if (has('editUserMsg')) setHtml('editUserMsg','<span class="error">Network error</span>');
    } finally { if (has('editUserSave')) get('editUserSave').disabled = false; }
  });
}

/* ========== delete user (defensive) ========== */
async function deleteUser(id) {
  try {
    const resp = await fetch((API_BASE || '') + '/api/admin/users/' + id, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const data = await resp.json();
    if(!resp.ok) {
      alert(data.message || 'Delete failed');
    } else {
      await loadUsers();
    }
  } catch(err) {
    console.error(err);
    alert('Network error');
  }
}

/* ========== Initialize (defensive) ========== */
(function init(){
  applyLanguage(localStorage.getItem('seha_lang') || 'en');

  // account dropdown toggle
  const accBtn = get('accountBtn'), accDropdown = get('accountDropdown');
  if (accBtn && accDropdown) {
    on(accBtn, 'click', () => {
      const expanded = accBtn.getAttribute('aria-expanded') === 'true';
      accBtn.setAttribute('aria-expanded', String(!expanded));
      accDropdown.style.display = expanded ? 'none' : 'block';
    });
    document.addEventListener('click', (ev) => {
      // guard contains usage
      try {
        if (!accBtn.contains(ev.target) && !accDropdown.contains(ev.target)) {
          accBtn.setAttribute('aria-expanded', 'false');
          accDropdown.style.display = '';
        }
      } catch (e) {}
    });
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 880) {
      const mm = get('mobileMenu'); if (mm) mm.classList.add('hidden');
      const hb = get('hambBtn'); if (hb) hb.setAttribute('aria-expanded','false');
    }
  });

  // Wire backdrop clicks to close modals (manage & admin modals)
  ['manageModalBackdrop','addUserBackdrop','editUserBackdrop'].forEach(bid => {
    const bd = get(bid);
    if(!bd) return;
    bd.addEventListener('click', (ev) => { if(ev.target === bd) closeModal(bid); });
  });

  // final auth UI refresh
  refreshAuthUI();
})();




