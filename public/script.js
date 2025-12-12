



/* user.js — core UI/auth helpers (improved, backoff-aware) */

/* CONFIG */
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : 'https://somali-eye-health-alliance-biaj.onrender.com';


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
/* ===== auth storage helpers (replace existing setUser/getUser) ===== */
function setUser(u){
  if(u) {
    try { localStorage.setItem('seha_user', JSON.stringify(u)); } catch(e){}
    try { localStorage.setItem('seha_role', u.role || 'user'); } catch(e){} // <<--- important
  } else {
    try { localStorage.removeItem('seha_user'); } catch(e){}
    try { localStorage.removeItem('seha_role'); } catch(e){}
  }
}
function getUser(){ try { return JSON.parse(localStorage.getItem('seha_user')) } catch(e){ return null } }

/* ===== admin header helper =====
   Adds/removes the "Contacts (Developer)" button using getUser() (so it's always consistent)
*/
window.__seha_updateAdminBtn = function() {
  try {
    const user = getUser();
    const container = document.getElementById('headerActions');
    if (!container) return;
    const existing = document.getElementById('adminContactsBtn');
    // only show for superadmin
    if (user && user.role === 'superadmin') {
      if (!existing) {
        const btn = document.createElement('button');
        btn.id = 'adminContactsBtn';
        btn.className = 'btn ghost';
        btn.textContent = 'Contacts (Developer)';
        btn.style.border = '1px solid rgba(15,118,110,0.12)';
        btn.style.background = 'transparent';
        btn.addEventListener('click', ()=> {
          // adjust path to your admin area
          window.location.href = (location.pathname.startsWith('/admin') ? './dashboard-developers.html' : 'admin/dashboard-developers.html');
        });
        container.appendChild(btn);
      }
    } else {
      if (existing) existing.remove();
    }
  } catch (e) { /* silent */ }
};


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

        // keep existing UI updates...
        // ensure header admin button is updated now that we have the authoritative role
        if (typeof window.__seha_updateAdminBtn === 'function') window.__seha_updateAdminBtn();

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










/* script.js - hero + site behaviour (updated)
   - conservative natural-size detection so images stay cover
   - hides per-slide caption on small screens (keeps aria-hidden)
   - hero thumbnails, keyboard support, auto-advance
   - grid population for programs, resources, events unchanged
*/

const CONFIG = {
  IMG_COUNT: 6,
  HERO_SLIDES: 6,
  HERO_INTERVAL_MS: 6000,
};

const programGrid = document.getElementById('programGrid');
const resourceGallery = document.getElementById('resourceGallery');
const eventsGrid = document.getElementById('eventsGrid');
const oppList = document.getElementById('oppList');
const awarenessGrid = document.getElementById('awarenessGrid');
const mobileMenu = document.getElementById('mobileMenu');
const hambBtn = document.getElementById('hambBtn');

/* ====== SEHA: single back-to-top button (inject once) ======
   - Creates the button if not present
   - Injects default styles (can be moved to style.css)
   - Shows after page scroll (throttled), scrolls to .site-header (if present)
*/
(function initSehaBackToTop() {
  const ID = 'sehaBackToTop';
  // If button already exists (maybe you added markup in HTML), use it.
  let btn = document.getElementById(ID);

  // create default styles if not already injected
  if (!document.getElementById('seha-back-to-top-styles')) {
    const style = document.createElement('style');
    style.id = 'seha-back-to-top-styles';
    style.textContent = `
/* default back-to-top styles (override in style.css as needed) */
.seha-back-to-top {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.75);
  color: #fff;
  border: 0;
  box-shadow: 0 6px 18px rgba(2,6,23,0.45);
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
  transition: opacity .24s ease, transform .24s ease;
  z-index: 1200;
}
.seha-back-to-top.show {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.seha-back-to-top svg { width:20px; height:20px; display:block; }
.seha-back-to-top:focus { outline: 3px solid rgba(255,255,255,0.18); outline-offset: 2px; }
@media (max-width:420px) {
  .seha-back-to-top { right: 12px; bottom: 12px; width:40px; height:40px; }
}
    `;
    document.head.appendChild(style);
  }

  // create the button if missing
  if (!btn) {
    btn = document.createElement('button');
    btn.id = ID;
    btn.className = 'seha-back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.setAttribute('title', 'Back to top');
    btn.type = 'button';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
        <path d="M12 4l-8 8h5v8h6v-8h5z"></path>
      </svg>
    `;
    // append to body so it's on every page
    // place at end so it doesn't interfere with layout
    document.body.appendChild(btn);
  }

  // Behavior
  const showAfter = 240; // px scrolled before showing
  const headerEl = document.querySelector('.site-header');

  function scrollToTopOrHeader() {
    // prefer scrolling to header top if exists
    const targetTop = headerEl ? headerEl.offsetTop : 0;
    // Respect reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      if (prefersReduced) window.scrollTo(0, targetTop);
      else window.scrollTo({ top: targetTop, behavior: 'smooth' });
    } catch (err) {
      window.scrollTo(0, targetTop);
    }
  }

  function onClickHandler(e) {
    e.preventDefault();
    scrollToTopOrHeader();
    // restore focus after animation
    btn.blur();
  }

  btn.removeEventListener('click', onClickHandler); // avoid duplicate listeners
  btn.addEventListener('click', onClickHandler);

  // keyboard activation
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      btn.click();
    }
  });

  // show/hide on scroll (rAF-throttled)
  let ticking = false;
  function updateVisibility() {
    if (window.scrollY > showAfter) btn.classList.add('show');
    else btn.classList.remove('show');
  }
  // initial check
  updateVisibility();

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateVisibility();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // also update on resize and on history navigation (pages that restore scroll)
  window.addEventListener('resize', updateVisibility, { passive: true });
  window.addEventListener('pageshow', updateVisibility);
})();



(function () {
  const IMG_COUNT = Math.max(1, CONFIG.IMG_COUNT);
  const HERO_SLIDES = Math.min(CONFIG.HERO_SLIDES, IMG_COUNT);

  // hero DOM refs
  const heroSlidesEl = document.getElementById('heroSlides');
  const heroGallery = document.getElementById('heroGallery');
  const heroCaptionBox = document.getElementById('heroCaptionBox');
  const heroCaptionTitle = document.getElementById('heroCaptionTitle');
  const heroCaptionText = document.getElementById('heroCaptionText');
  const heroCaptionExtra = document.getElementById('heroCaptionExtra');
  const heroTitle = document.getElementById('heroTitle');
  const heroDescription = document.getElementById('heroDescription');
  const heroPrev = document.getElementById('heroPrev');
  const heroNext = document.getElementById('heroNext');
  const heroSlideCounter = document.getElementById('heroSlideCounter'); // optional element

  function createImg(src, alt) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt || '';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.classList.add('broken'));
    return img;
  }

  const HERO_DATA = [
    {
      img: "images/schoolscreen3.jpeg",
      title: "Community screening & spectacles",
      description: "Large school and community screening campaigns detect refractive errors and provide low-cost spectacles.",
      extra: "Local optical workshops are trained and follow-up pathways established with district clinics."
    },
    {
      img: "images/surgerical1.jpeg",
      title: "Surgical mentorship & camps",
      description: "Mobile surgical campaigns and mentorship strengthen cataract services and surgical safety.",
      extra: "Visiting specialists work alongside Somali surgeons to transfer skills and best practice."
    },
    {
      img: "images/screening6.jpeg",
      title: "Workforce training & CPD",
      description: "Continuous professional development for nurses, optometrists and mid-level eye workers.",
      extra: "Hands-on training, practical triage and local trainer development are emphasised."
    },
    {
      img: "images/screening.jpeg",
      title: "Research & operational learning",
      description: "Operational research to test low-cost screening workflows and data collection systems for Somalia.",
      extra: "Findings are shared through toolkits and summaries with partners and ministries."
    },
    {
      img: "images/maamo qaliin.jpeg",
      title: "Diagnostics & tele-referral pilots",
      description: "Pilot basic imaging and remote consultation to expand specialist support to remote clinics.",
      extra: "Tele-referral reduces travel burden and speeds decisions for urgent cases."
    },
    {
      img: "images/screening3.jpeg",
      title: "Finance & small-grants support",
      description: "Support clinics to run small optical workshops and manage grants for sustainability.",
      extra: "We build simple financial tools and procurement guidance with local teams."
    }
  ];
  
  
  // Build hero DOM (slides + thumbs)
  (function buildHeroDOM() {
    if (!heroSlidesEl || !heroGallery) return;
    heroSlidesEl.innerHTML = '';
    heroGallery.innerHTML = '';

    HERO_DATA.forEach((h, i) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide';
      slide.dataset.index = i;
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-label', h.title);

      const img = document.createElement('img');
      img.className = 'hero-img';
      img.src = h.img;
      img.srcset = `${h.img} 1200w, ${h.img.replace('.png','@2x.png')} 2400w`;
      img.sizes = '(max-width:980px) 100vw, 1200px';
      img.alt = h.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => img.classList.add('broken'));

      const overlay = document.createElement('div');
      overlay.className = 'hero-overlay';

      slide.appendChild(img);
      slide.appendChild(overlay);
      heroSlidesEl.appendChild(slide);

      const thumb = createImg(h.img, `Thumbnail ${i+1}`);
      thumb.dataset.index = i;
      thumb.tabIndex = 0;
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('aria-label', `Show slide ${i+1}: ${h.title}`);
      heroGallery.appendChild(thumb);
    });
  })();

  
  // Behavior (pager UI removed)
  (function heroBehavior() {
    const slides = Array.from(document.querySelectorAll('.hero-slide'));
    const thumbs = Array.from(document.querySelectorAll('#heroGallery img'));
    if (!slides.length) return;

    // hide existing DOM slide counter element if present
    if (heroSlideCounter) {
      heroSlideCounter.style.display = 'none';
      heroSlideCounter.setAttribute('aria-hidden','true');
    }

    let active = 0;
    slides.forEach(s => s.classList.remove('active'));
    slides[0].classList.add('active');
    if (thumbs[0]) thumbs[0].classList.add('active');

    function updateHeroContent(idx) {
      const d = HERO_DATA[idx] || HERO_DATA[0];
      if (heroTitle) heroTitle.textContent = d.title;
      if (heroDescription) heroDescription.textContent = d.description;
      if (heroCaptionTitle) heroCaptionTitle.textContent = d.title;
      if (heroCaptionText) heroCaptionText.textContent = d.description;
      if (heroCaptionExtra) heroCaptionExtra.textContent = d.extra;
      if (heroSlideCounter) heroSlideCounter.textContent = `${idx+1} / ${slides.length}`;
    }

    updateHeroContent(0);

    function goTo(idx) {
      if (idx < 0) idx = slides.length - 1;
      if (idx >= slides.length) idx = 0;
      if (idx === active) return;
      slides[active].classList.remove('active');
      if (thumbs[active]) thumbs[active].classList.remove('active');
      active = idx;
      slides[active].classList.add('active');
      if (thumbs[active]) thumbs[active].classList.add('active');
      updateHeroContent(active);
      // Re-check natural sizing for the newly active slide (helps if images load later)
      checkNaturalSizesForSlide(slides[active]);
    }

    // auto advance
    let paused = false;
    let timer = setInterval(() => { if (!paused) goTo((active + 1) % slides.length); }, CONFIG.HERO_INTERVAL_MS);
    function resetTimer() { clearInterval(timer); timer = setInterval(() => { if (!paused) goTo((active + 1) % slides.length); }, CONFIG.HERO_INTERVAL_MS); }

    [heroSlidesEl, heroGallery, heroCaptionBox].forEach(el => {
      if (!el) return;
      el.addEventListener('mouseenter', () => paused = true);
      el.addEventListener('mouseleave', () => paused = false);
      el.addEventListener('focusin', () => paused = true);
      el.addEventListener('focusout', () => paused = false);
    });

    if (heroPrev) heroPrev.addEventListener('click', () => { goTo(active - 1); resetTimer(); });
    if (heroNext) heroNext.addEventListener('click', () => { goTo(active + 1); resetTimer(); });

    if (heroGallery) {
      heroGallery.addEventListener('click', (e) => {
        const img = e.target.closest('img'); if (!img) return;
        const idx = Number(img.dataset.index); if (Number.isNaN(idx)) return;
        goTo(idx); resetTimer();
      });
      heroGallery.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const img = e.target.closest('img'); if (!img) return;
          const idx = Number(img.dataset.index); if (Number.isNaN(idx)) return;
          goTo(idx); resetTimer();
        }
      });
      heroGallery.querySelectorAll('img').forEach(i => i.setAttribute('role','button'));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { goTo(active - 1); resetTimer(); }
      if (e.key === 'ArrowRight') { goTo(active + 1); resetTimer(); }
    });

    /* NATURAL-SIZE DETECTION (conservative)
       We only mark an image 'natural' if BOTH its naturalWidth and naturalHeight
       are significantly smaller than the hero area (THRESHOLD small). This keeps
       most images using object-fit: cover so they always fill the hero.
    */
    const NATURAL_THRESHOLD = 0.45; // smaller -> fewer images treated as natural

    function checkNaturalSizes() {
      const areaW = heroSlidesEl ? heroSlidesEl.clientWidth : window.innerWidth;
      const areaH = heroSlidesEl ? heroSlidesEl.clientHeight : window.innerHeight;
      slides.forEach(slide => checkNaturalSizesForSlide(slide, areaW, areaH));
    }

    function checkNaturalSizesForSlide(slide, areaW, areaH) {
      const img = slide.querySelector('img.hero-img');
      if (!img) return;
      const apply = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          if (img.naturalWidth < (areaW * NATURAL_THRESHOLD) && img.naturalHeight < (areaH * NATURAL_THRESHOLD)) {
            img.classList.add('hero-img-natural');
          } else {
            img.classList.remove('hero-img-natural');
          }
        }
      };
      if (img.complete) apply(); else img.addEventListener('load', apply);
    }

    checkNaturalSizes();
    let rtid = null;
    window.addEventListener('resize', () => { clearTimeout(rtid); rtid = setTimeout(() => checkNaturalSizes(), 120); });

    /* hide caption on small screens for accessibility: keep aria-hidden in sync */
    const mql = window.matchMedia('(max-width:560px)');
    function syncCaptionVisibility() {
      if (!heroCaptionBox) return;
      if (mql.matches) {
        heroCaptionBox.style.display = 'none';
        heroCaptionBox.setAttribute('aria-hidden','true');
      } else {
        heroCaptionBox.style.display = '';
        heroCaptionBox.setAttribute('aria-hidden','false');
      }
    }
    mql.addEventListener ? mql.addEventListener('change', syncCaptionVisibility) : mql.addListener(syncCaptionVisibility);
    syncCaptionVisibility();

  })();

  // ---------- PROGRAMS (10 items) ----------
  if (programGrid) {
    const programs = [
      { id: 1, title: 'Strengthening Emergency Obstetric & Newborn Care', img: 'images/program1.png', thumb: 'images/program1.png', excerpt: 'Capacity building in referral hospitals and clinical mentoring.' },
      { id: 2, title: 'Health Investment & Finance', img: 'images/program2.png', thumb: 'images/program2.png', excerpt: 'Sustainable financing models and public-private collaboration.' },
      { id: 3, title: 'Research & Innovation', img: 'images/program3.png', thumb: 'images/program3.png', excerpt: 'Operational research and evidence translation for eye health.' },
      { id: 4, title: 'Human Resources for Health (HRH)', img: 'images/mamo.jpeg', thumb: 'images/program4.png', excerpt: 'Training, exchange programs and workforce planning.' },
      { id: 5, title: 'Eye Screening & Outreach', img: 'images/program5.png', thumb: 'images/program5.png', excerpt: 'Community-level screening campaigns and referrals.' },
      { id: 6, title: 'Surgical Partnerships', img: 'images/program6.png', thumb: 'images/program6.png', excerpt: 'Specialist campaigns and mentorship.' },
      { id: 7, title: 'Telemedicine & Diagnostics', img: 'images/program7.png', thumb: 'images/program7.png', excerpt: 'Pilots linking remote clinics with specialist advice and imaging.' },
      { id: 8, title: 'Optical Workshops & Social Enterprise', img: 'images/program8.png', thumb: 'images/program8.png', excerpt: 'Support small optical workshops and local enterprise models.' },
      { id: 9, title: 'Child & School Vision', img: 'images/program9.png', thumb: 'images/program9.png', excerpt: 'School-based screening and child eye health initiatives.' },
      { id:10, title: 'Quality & Safety in Eye Surgery', img: 'images/program10.png', thumb: 'images/program10.png', excerpt: 'Surgery quality improvement, checklists and mentoring.' }
    ];

    // populate grid
    programGrid.innerHTML = '';
    programs.forEach(p => {
      const card = document.createElement('article');
      card.className = 'card program-card';
      // choose thumbnail if present, else use img, fallback to images/image1.png
      const thumbSrc = p.thumb || p.img || 'images/image1.png';
      card.innerHTML = `
        <img src="${thumbSrc}" alt="${p.title}" loading="lazy" onerror="this.classList.add('broken'); this.src='images/image1.png'">
        <div style="padding:12px">
          <h4 style="margin:0 0 8px">${p.title}</h4>
          <p class="muted" style="margin:0 0 10px">${p.excerpt}</p>
          <p style="margin:0"><a href="program-detail-${p.id}.html">Read more →</a></p>
        </div>
      `;
      programGrid.appendChild(card);
    });
  }

 // ---------- RESOURCE GALLERY ----------
 if (resourceGallery) {
  // list of resources (images, infographics, reports, videos)
  // update these filenames to match your real files.
  const RESOURCES = [
    { id: 1, type: 'Photo', src: 'images/resource1.png', title: 'Outreach day — Hargeisa', file: 'images/resource1.png' },
    { id: 2, type: 'Photo', src: 'images/resource2.png', title: 'Community screening — Borama', file: 'images/resource2.png' },
    { id: 3, type: 'Photo', src: 'images/resource3.png', title: 'Volunteer training', file: 'images/resource3.png' },
    { id: 4, type: 'Infographic', src: 'images/resource4.png', title: 'Vision week infographic', file: 'images/resource4.png' },
    { id: 5, type: 'Report', src: 'images/resource5.png', title: 'Annual report snapshot', file: 'files/SEHA-Annual-Report-2025.pdf', download: true },
    { id: 6, type: 'Photo', src: 'images/resource6.png', title: 'School screening', file: 'images/resource6.png' },
    { id: 7, type: 'Photo', src: 'images/resource7.png', title: 'Optical workshop setup', file: 'images/resource7.png' },
    { id: 8, type: 'Infographic', src: 'images/resource8.png', title: 'Referral pathway', file: 'images/resource8.png' },
    { id: 9, type: 'Video', src: 'images/video1-thumb.png', title: 'Field highlights (video)', file: 'videos/resource1.mp4', video: true },
    { id:10, type: 'Photo', src: 'images/resource10.png', title: 'Surgical mentorship', file: 'images/resource10.png' },
    { id:11, type: 'Photo', src: 'images/resource11.png', title: 'Community Eye Day', file: 'images/resource11.png' },
    { id:12, type: 'Report', src: 'images/resource12.png', title: 'Screening toolkit', file: 'files/Community-Screening-Toolkit.zip', download: true }
  ];

  // filter state
  let currentFilter = 'All';

  // DOM references
  const filterBar = document.getElementById('resourceFilterBar');

  function buildGallery(filter = 'All') {
    resourceGallery.innerHTML = '';
    const filtered = RESOURCES.filter(r => filter === 'All' ? true : r.type === filter);
    if (!filtered.length) {
      const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No items found for this filter.'; resourceGallery.appendChild(p); return;
    }

    filtered.forEach(r => {
      const card = document.createElement('div');
      card.className = 'gallery-item';
      card.style = 'display:inline-block;margin:6px;vertical-align:top;width:140px;text-align:left';

      const thumb = createImg(r.src, r.title);
      thumb.style.width = '140px';
      thumb.style.height = '86px';
      thumb.style.objectFit = 'cover';
      thumb.style.borderRadius = '6px';
      thumb.tabIndex = 0;
      thumb.setAttribute('data-id', r.id);
      card.appendChild(thumb);

      const label = document.createElement('div');
      label.style.fontSize = '13px'; label.style.marginTop = '6px';
      label.textContent = r.title.length > 36 ? (r.title.slice(0,34) + '…') : r.title;
      card.appendChild(label);

      // actions: view / download if available
      const actionRow = document.createElement('div');
      actionRow.style.marginTop = '6px';
      actionRow.style.display = 'flex';
      actionRow.style.gap = '6px';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn small';
      viewBtn.textContent = r.video ? 'Play' : 'View';
      viewBtn.style.padding = '6px 8px';
      viewBtn.addEventListener('click', () => openResource(r));
      actionRow.appendChild(viewBtn);

      if (r.download || (r.file && !r.video)) {
        const dl = document.createElement('a');
        dl.href = r.file;
        dl.download = r.download ? '' : undefined;
        dl.className = 'btn small';
        dl.textContent = 'Download';
        dl.style.padding = '6px 8px';
        actionRow.appendChild(dl);
      }

      card.appendChild(actionRow);
      resourceGallery.appendChild(card);

      // keyboard enter/space on thumbnail opens
      thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openResource(r); });
      thumb.addEventListener('click', () => openResource(r));
    });
  }

  // open overlay for image or video
  function openResource(r) {
    // don't open if broken thumb
    // create overlay
    const overlay = document.createElement('div');
    overlay.className = 'seha-overlay';
    overlay.style = 'position:fixed;inset:0;background:rgba(2,6,23,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:18px';
    if (r.video) {
      overlay.innerHTML = `
        <div style="position:relative;max-width:92%;max-height:92%;width:min(920px,100%)">
          <video controls autoplay style="width:100%;height:auto;border-radius:8px;display:block">
            <source src="${r.file}" type="video/mp4">
            Your browser does not support the video element.
          </video>
          <button aria-label="Close" class="overlay-close" style="position:absolute;top:10px;right:10px;padding:8px 10px;border-radius:8px;border:0;background:#fff;cursor:pointer">Close</button>
        </div>
      `;
    } else if (r.file && (r.file.endsWith('.pdf') || r.file.endsWith('.zip'))) {
      // show preview thumbnail + download link for downloadable reports
      overlay.innerHTML = `
        <div style="position:relative;max-width:920px;width:92%;background:#fff;padding:18px;border-radius:8px;color:#000;max-height:92%;overflow:auto">
          <div style="display:flex;gap:14px;align-items:flex-start">
            <img src="${r.src}" alt="${r.title}" style="width:160px;height:100px;object-fit:cover;border-radius:6px;">
            <div>
              <h3 style="margin:0 0 8px;color:#111">${r.title}</h3>
              <p class="muted" style="margin:0 0 12px">This resource is available for download.</p>
              <a href="${r.file}" class="btn" download style="display:inline-block;padding:8px 10px">Download</a>
            </div>
          </div>
          <button aria-label="Close" class="overlay-close" style="position:absolute;top:10px;right:10px;padding:8px 10px;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer">Close</button>
        </div>
      `;
    } else {
      overlay.innerHTML = `
        <div style="position:relative;max-width:92%;max-height:92%">
          <img src="${r.file || r.src}" style="max-width:100%;max-height:100%;border-radius:8px;display:block">
          <button aria-label="Close" class="overlay-close" style="position:absolute;top:10px;right:10px;padding:8px 10px;border-radius:8px;border:0;background:#fff;cursor:pointer">Close</button>
        </div>
      `;
    }

    overlay.querySelector('.overlay-close').addEventListener('click', () => document.body.removeChild(overlay));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
  }

  // filter bar wiring
  if (filterBar) {
    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterBar.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
        btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
        currentFilter = btn.dataset.filter;
        buildGallery(currentFilter === 'All' ? 'All' : currentFilter);
      });
    });
    // mark All active initially
    const allBtn = filterBar.querySelector('.filter-btn[data-filter="All"]');
    if (allBtn) { allBtn.classList.add('active'); allBtn.setAttribute('aria-pressed','true'); }
  }

  // initial render
  buildGallery('All');
} // end resourceGallery


// ---------- EVENTS ----------
if (eventsGrid) {
  const events = [
    { id: 1, title: 'PONT Project - Improving Access to Oxygen', img: 'images/image1.png', date: '2023-03-15', excerpt: 'Long-term partnership improving oxygen supply in regional hospitals.' },
    { id: 2, title: 'The Bridge Program Launch', img: 'images/here1.png', date: '2026-05-02', excerpt: 'Launch event presenting pilot plans to translate research into practice.' },
    { id: 3, title: 'SEHA Global Placement Survey', img: 'images/image4.png', date: '2025-02-20', excerpt: 'Survey to better match volunteers with host institutions.' },
    { id: 4, title: 'School Vision Screening — Borama', img: 'images/image2.png', date: '2024-04-10', excerpt: 'Multi-school campaign screening thousands of children.' },
    { id: 5, title: 'Surgical Mentorship Week — Hargeisa', img: 'images/here7.png', date: '2023-06-01', excerpt: 'Visiting surgeons provide hands-on mentorship to local teams.' },
    { id: 6, title: 'Tele-referral Pilot — Garowe', img: 'images/program3.png', date: '2024-07-18', excerpt: 'Pilot connecting remote clinics with specialists via imaging and messaging.' },
    { id: 7, title: 'Optical Workshop Set-up — Beledweyne', img: 'images/resource5.png', date: '2025-11-30', excerpt: 'Support to establish a small optical dispensing workshop.' },
    { id: 8, title: 'CPD Nurse Training — Mogadishu', img: 'images/image6.png', date: '2025-09-22', excerpt: 'Practical training for nurses and mid-level clinicians.' },
    { id: 9, title: 'Research Symposium — Evidence to Action', img: 'images/program9.png', date: '2025-12-05', excerpt: 'Sharing operational research and planning scale-up.' },
    { id:10, title: 'Volunteer Meet & Training — National', img: 'images/here8.png', date: '2025-08-14', excerpt: 'Orientation and safety briefings for volunteer clinicians.' }
  ];

  eventsGrid.innerHTML = '';
  events.forEach(ev => {
    const d = document.createElement('div');
    d.className = 'card list-item';
    d.innerHTML = `
      <img src="${ev.img}" alt="${ev.title}" onerror="this.classList.add('broken');this.src='images/image1.png'">
      <div>
        <h4 style="margin:0">${ev.title}</h4>
        <div class="muted" style="font-size:13px">${ev.date}</div>
        <p class="muted" style="margin-top:6px">${ev.excerpt}</p>
        <p style="margin-top:8px"><a href="event-detail-${ev.id}.html">Read more →</a></p>
      </div>
    `;
    eventsGrid.appendChild(d);
  });
}


  // // ---------- OPPORTUNITIES & AWARENESS ----------
  // if (oppList) {
  //   const OPPS = [
  //     { id: 1, title: 'Volunteer Ophthalmic Nurse - Boorama', location: 'Boorama', type: 'Volunteer', duration: '6 months', stipend: 'Basic stipend & accommodation', excerpt: 'Support outreach and theatre lists; assist with refraction and postoperative follow-up.' },
  //     { id: 2, title: 'Research Assistant (part-time) - Mogadishu', location: 'Mogadishu', type: 'Part-time', duration: '6 months', stipend: 'Monthly honorarium', excerpt: 'Support monitoring & evaluation, data collection and report writing.' },
  //     { id: 3, title: 'Optical Technician (short contract) - Hargeisa', location: 'Hargeisa', type: 'Short-term contract', duration: '3 months', stipend: 'Paid contract', excerpt: 'Set up small optical dispensing workshop and train local staff.' },
  //     { id: 4, title: 'Community Outreach Coordinator - Beledweyne', location: 'Beledweyne', type: 'Employment', duration: '12 months', stipend: 'Salary (competitive)', excerpt: 'Lead community mobilization, partner liaison and vendor logistics for outreach days.' },
  //     { id: 5, title: 'CPD Trainer (voluntary) - National', location: 'Multiple', type: 'Volunteer', duration: 'Ongoing', stipend: 'Travel covered', excerpt: 'Deliver short CPD sessions and mentorship to nurses and optometrists in regions.' },
  //     { id: 6, title: 'Communications Intern - Remote', location: 'Remote', type: 'Internship', duration: '3 months', stipend: 'Small stipend', excerpt: 'Support communications, social media and simple reporting for campaigns.' }
  //   ];

  //   // render grid
  //   oppList.innerHTML = '';
  //   oppList.classList.add('opportunities-grid');
  //   OPPS.forEach(o => {
  //     const d = document.createElement('article');
  //     d.className = 'card opp-card';
  //     d.innerHTML = `
  //       <h4>${o.title}</h4>
  //       <div class="opp-meta">
  //         <div>${o.location}</div>
  //         <div>•</div>
  //         <div>${o.type}</div>
  //         <div>•</div>
  //         <div>${o.duration}</div>
  //       </div>
  //       <p class="opp-excerpt">${o.excerpt}</p>
  //       <div style="margin-top:auto;display:flex;gap:8px;align-items:center">
  //         <a href="opportunity-detail-${o.id}.html" class="btn secondary" style="text-decoration:none;padding:8px 10px">Details</a>
  //         <button class="apply-btn" data-oppid="${o.id}" type="button">Apply now →</button>
  //       </div>
  //     `;
  //     oppList.appendChild(d);
  //   });

  //   // modal elements (may be absent on some pages) — guard each reference
  //   const applyModal = document.getElementById('applyModal');
  //   const applyJobTitle = document.getElementById('applyJobTitle');
  //   const applyForm = document.getElementById('applyForm');
  //   const appName = document.getElementById('appName');
  //   const appEmail = document.getElementById('appEmail');
  //   const appStatement = document.getElementById('appStatement');
  //   const appCV = document.getElementById('appCV');
  //   const appCVName = document.getElementById('appCVName');
  //   const applyMsg = document.getElementById('applyMsg');
  //   const modalClose = document.getElementById('modalClose');
  //   const applyCancel = document.getElementById('applyCancel');

  //   let lastOpener = null;
  //   let currentOpp = null;
  
  //   function openModalForOpp(opp, openerEl = null) {
  //     // If modal doesn't exist on this page, go to detail page (fallback)
  //     if (!applyModal) {
  //       // navigate to the detail page and indicate intent to open the modal via hash
  //       window.location.href = `opportunity-detail-${opp.id}.html#apply`;
  //       return;
  //     }
    
  //     currentOpp = opp;
  //     if (applyJobTitle) applyJobTitle.textContent = opp.title;
    
  //     // safer: find the <strong> node and update if present
  //     const meta = document.getElementById('applyJobMeta');
  //     if (meta) {
  //       const strong = meta.querySelector('strong');
  //       if (strong) strong.textContent = opp.title;
  //     }
    
  //     if (applyMsg) applyMsg.textContent = '';
  //     if (applyForm) applyForm.reset();
  //     if (appCVName) appCVName.textContent = '';
    
  //     // show modal
  //     applyModal.classList.add('open');
  //     applyModal.setAttribute('aria-hidden','false');
    
  //     // remember opener for focus restoration
  //     lastOpener = openerEl || lastOpener;
  //     setTimeout(() => { if (appName) appName.focus(); }, 50);
  //   }
    
  //   function closeModal() {
  //     if (!applyModal) return;
  //     applyModal.classList.remove('open');
  //     applyModal.setAttribute('aria-hidden','true');
  //     if (applyMsg) applyMsg.textContent = '';
  //     if (lastOpener && typeof lastOpener.focus === 'function') lastOpener.focus();
  //     lastOpener = null;
  //     currentOpp = null;
  //   }
    

  //   // open on apply button click inside oppList
  //   oppList.addEventListener('click', (e) => {
  //     const btn = e.target.closest('.apply-btn');
  //     if (!btn) return;
  //     const id = Number(btn.dataset.oppid);
  //     const opp = OPPS.find(x => x.id === id);
  //     if (!opp) return;
  //     lastOpener = btn;
  //     openModalForOpp(opp, btn);
  //   });

  //   // FILE PREVIEW — only wire if element exists
  //   if (appCV) {
  //     appCV.addEventListener('change', (e) => {
  //       const f = e.target.files && e.target.files[0];
  //       if (f && appCVName) {
  //         appCVName.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
  //       } else if (appCVName) {
  //         appCVName.textContent = '';
  //       }
  //     });
  //   }

  //   // close handlers (only if modal exists)
  //   if (modalClose) modalClose.addEventListener('click', closeModal);
  //   if (applyCancel) applyCancel.addEventListener('click', closeModal);
  //   if (applyModal) {
  //     applyModal.addEventListener('click', (e) => { if (e.target === applyModal) closeModal(); });
  //     document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && applyModal.classList.contains('open')) closeModal(); });
  //   }

  //   // FORM SUBMIT (only if form exists)
  //   if (applyForm) {
  //     applyForm.addEventListener('submit', (e) => {
  //       e.preventDefault();
  //       if (!applyMsg) return;
  //       applyMsg.style.color = 'var(--muted)';
  //       applyMsg.textContent = '';

  //       const nameVal = appName && appName.value && appName.value.trim();
  //       const emailVal = appEmail && appEmail.value && appEmail.value.trim();
  //       const statementVal = appStatement && appStatement.value && appStatement.value.trim();

  //       if (!nameVal || !emailVal || !statementVal) {
  //         applyMsg.style.color = '#d9534f';
  //         applyMsg.textContent = 'Please complete name, email and short statement before submitting.';
  //         return;
  //       }

  //       // demo payload (client-side only)
  //       const payload = {
  //         opportunityId: currentOpp ? currentOpp.id : null,
  //         name: nameVal,
  //         email: emailVal,
  //         statement: statementVal,
  //         availableFrom: document.getElementById('appStart') ? document.getElementById('appStart').value : '',
  //         type: document.getElementById('appType') ? document.getElementById('appType').value : '',
  //       };

  //       applyMsg.style.color = 'var(--primary)';
  //       applyMsg.textContent = 'Sending application...';

  //       // simulate network
  //       setTimeout(() => {
  //         applyMsg.style.color = 'var(--primary)';
  //         applyMsg.textContent = 'Application received — thank you! We will contact you by email if shortlisted.';
  //         applyForm.reset();
  //         if (appCVName) appCVName.textContent = '';
  //         setTimeout(() => closeModal(), 1400);
  //       }, 900);
  //     });
  //   }
  // } // end oppList block

  // if (awarenessGrid) {
  //   // Data for 6 campaigns (id 1..6). Categories must match filter names below.
  //   const CAMPAIGNS = [
  //     { id: 1, title: 'School Vision Screening — Borama', category: 'School screening', img: IMAGE(1), excerpt: 'Toolkit and checklist for high-quality school screening events.' },
  //     { id: 2, title: 'Community Outreach — Afgooye', category: 'Community outreach', img: IMAGE(2), excerpt: 'Mobile outreach campaign bringing screening and spectacles to rural communities.' },
  //     { id: 3, title: 'Campaign Toolkit: Vision Week', category: 'Campaign toolkit', img: IMAGE(3), excerpt: 'A full toolkit for running a Vision Week campaign — posters, checklists and outreach scripts.' },
  //     { id: 4, title: 'Poster Pack: Child Vision', category: 'Poster', img: IMAGE(4), excerpt: 'Printable posters targeted at schoolchildren and parents — multilingual assets.' },
  //     { id: 5, title: 'School Screening — Hargeisa pilot', category: 'School screening', img: IMAGE(5), excerpt: 'Pilot materials and evaluation summary from Hargeisa pilot screenings.' },
  //     { id: 6, title: 'Community Eye Day — Beledweyne', category: 'Community outreach', img: IMAGE(6), excerpt: 'Community Eye Day resources and follow-up pathways for district clinics.' }
  //   ];

  //   // Filter set & default
  //   const FILTERS = ['All', 'School screening', 'Community outreach', 'Campaign toolkit', 'Poster'];
  //   let currentFilter = 'All';

  //   // Build filter bar (insert above awarenessGrid if not already present)
  //   let filterBar = document.querySelector('.filter-bar--awareness');
  //   if (!filterBar) {
  //     filterBar = document.createElement('div');
  //     filterBar.className = 'filter-bar filter-bar--awareness';
  //     FILTERS.forEach(f => {
  //       const btn = document.createElement('button');
  //       btn.className = 'filter-btn';
  //       btn.type = 'button';
  //       btn.textContent = f;
  //       btn.dataset.filter = f;
  //       btn.setAttribute('aria-pressed', 'false');
  //       btn.addEventListener('click', () => {
  //         // set active
  //         filterBar.querySelectorAll('.filter-btn').forEach(b => {
  //           b.classList.remove('active'); b.setAttribute('aria-pressed','false');
  //         });
  //         btn.classList.add('active'); btn.setAttribute('aria-pressed','true');
  //         currentFilter = f;
  //         renderAwarenessGrid();
  //         // focus for keyboard users
  //         btn.focus();
  //       });
  //       filterBar.appendChild(btn);
  //     });
  //     // insert filter bar before the grid
  //     awarenessGrid.parentNode.insertBefore(filterBar, awarenessGrid);
  //   }

  //   // ensure correct styling class on awarenessGrid
  //   awarenessGrid.classList.add('awareness-grid');

  //   // Render function
  //   function renderAwarenessGrid() {
  //     awarenessGrid.innerHTML = '';
  //     const filtered = CAMPAIGNS.filter(c => (currentFilter === 'All' ? true : c.category === currentFilter));
  //     if (!filtered.length) {
  //       const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No items found for this filter.';
  //       awarenessGrid.appendChild(p); return;
  //     }
  //     filtered.forEach(c => {
  //       const card = document.createElement('article');
  //       card.className = 'card';
  //       card.setAttribute('data-category', c.category);
  //       card.innerHTML = `
  //         <img src="${c.img}" alt="${c.title}" loading="lazy" onerror="this.classList.add('broken');this.src='images/image1.png'">
  //         <div style="padding:6px 0 2px;">
  //           <h4 style="margin:0 0 6px;font-size:16px">${c.title}</h4>
  //           <div class="muted" style="font-size:13px;margin-bottom:6px">${c.category}</div>
  //           <p class="muted" style="margin:0 0 8px">${c.excerpt}</p>
  //           <p style="margin:0"><a href="campaign-detail-${c.id}.html" aria-label="Read more about ${c.title}">Read more →</a></p>
  //         </div>
  //       `;
  //       awarenessGrid.appendChild(card);
  //     });
  //   }

  //   // Activate default filter button ("All")
  //   const defaultBtn = filterBar.querySelector('.filter-btn[data-filter="All"]');
  //   if (defaultBtn) { defaultBtn.classList.add('active'); defaultBtn.setAttribute('aria-pressed','true'); }

  //   // initial render
  //   renderAwarenessGrid();
  // }

  // ----------------------------
  // Mobile menu builder with nested toggles (+ / −)
  // ----------------------------
  (function buildMobileMenu() {
    if (!mobileMenu) return;
    const desktopNav = document.querySelector('.main-nav .nav-list');
    if (!desktopNav) return;

    const mobileUL = document.createElement('ul');
    desktopNav.querySelectorAll(':scope > li').forEach((li, idx) => {
      const topA = li.querySelector('a');
      const topHref = topA ? topA.getAttribute('href') : '#';
      const topText = topA ? topA.textContent.trim() : 'Item';

      const mobileLI = document.createElement('li');

      const desktopSub = li.querySelector('.sub');
      if (desktopSub) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        const link = document.createElement('a');
        link.href = topHref || '#';
        link.textContent = topText;
        link.style.flex = '1';
        link.style.fontWeight = '700';
        row.appendChild(link);

        const btn = document.createElement('button');
        btn.className = 'mobile-sub-toggle';
        btn.textContent = '+';
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', `mobile-sub-${idx}`);
        btn.style.border = 0; btn.style.background = 'transparent'; btn.style.cursor = 'pointer'; btn.style.fontSize = '18px';
        row.appendChild(btn);

        mobileLI.appendChild(row);

        const nested = document.createElement('ul');
        nested.id = `mobile-sub-${idx}`;
        nested.style.listStyle = 'none';
        nested.style.paddingLeft = '14px';
        nested.style.display = 'none';

        desktopSub.querySelectorAll('li').forEach(sli => {
          const sa = sli.querySelector('a');
          if (!sa) return;
          const sitem = document.createElement('li');
          sitem.style.padding = '6px 0';
          const sLink = document.createElement('a');
          sLink.href = sa.getAttribute('href') || '#';
          sLink.textContent = sa.textContent.trim();
          sitem.appendChild(sLink);
          nested.appendChild(sitem);
        });

        btn.addEventListener('click', () => {
          const isOpen = nested.style.display === 'block';
          nested.style.display = isOpen ? 'none' : 'block';
          btn.textContent = isOpen ? '+' : '−';
          btn.setAttribute('aria-expanded', (!isOpen).toString());
        });

        mobileLI.appendChild(nested);
      } else {
        const link = document.createElement('a');
        link.href = topHref || '#';
        link.textContent = topText;
        link.style.fontWeight = '700';
        mobileLI.appendChild(link);
      }

      mobileUL.appendChild(mobileLI);
    });

    mobileMenu.innerHTML = '';
    mobileMenu.appendChild(mobileUL);
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');

    // hamburger toggle
    if (hambBtn) {
      hambBtn.addEventListener('click', () => {
        const open = mobileMenu.classList.toggle('open');
        mobileMenu.setAttribute('aria-hidden', (!open).toString());
        hambBtn.setAttribute('aria-expanded', open.toString());
      });
    }
  })();

  // Close mobile menu when clicking a link
  if (mobileMenu) {
    mobileMenu.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (a) {
        setTimeout(() => {
          mobileMenu.classList.remove('open');
          mobileMenu.setAttribute('aria-hidden', 'true');
          if (hambBtn) hambBtn.setAttribute('aria-expanded', 'false');
        }, 160);
      }
    });
  }

  // ---------- Forms (front-end only) ----------
  function setMsg(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(contactForm);
      if (!f.get('name') || !f.get('email') || !f.get('message')) {
        setMsg('contactMsg', 'Please fill required fields.');
        return;
      }
      setMsg('contactMsg', 'Message received — thank you.');
      contactForm.reset();
    });
  }
  const memberForm = document.getElementById('memberForm');
  if (memberForm) {
    memberForm.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(memberForm);
      if (!f.get('name') || !f.get('email')) { setMsg('memberMsg', 'Please enter name and email.'); return; }
      setMsg('memberMsg', 'Application received. Thank you.');
      memberForm.reset();
    });
  }
  const subForm = document.getElementById('subForm');
  if (subForm) {
    subForm.addEventListener('submit', e => {
      e.preventDefault();
      const email = new FormData(subForm).get('email');
      if (!email) { setMsg('subMsg', 'Enter a valid email.'); return; }
      setMsg('subMsg', 'Subscribed (demo).');
      subForm.reset();
    });
  }
  // Smooth in-page anchor scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (ev) {
      const href = this.getAttribute('href');
      if (href && href.length > 1 && href.startsWith('#')) {
        ev.preventDefault();
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
})(); // end IIFE
