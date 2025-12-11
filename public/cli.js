/* ---- Add near top of help widget IIFE: backoff state ---- */
let __seha_backoffUntil = 0;    // ms epoch until which we should pause polling
let __seha_backoffFactor = 1;   // doubling factor on repeated 429s
const SEHA_BACKOFF_MAX_FACTOR = 32;

/* ---- Replaced apiFetch (handles 429 and backoff) ---- */
async function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';

  // If we are currently in a backoff window, short-circuit and return a rate-limited-like result
  if (Date.now() < __seha_backoffUntil) {
    const retryAfter = Math.ceil((__seha_backoffUntil - Date.now()) / 1000);
    return { ok: false, status: 429, data: null, rateLimited: true, retryAfter };
  }

  const res = await fetch(API_BASE + url, opts);

  // if we get a 429, set backoff window using Retry-After if present, otherwise exponential backoff
  if (res.status === 429) {
    const ra = res.headers.get('Retry-After');
    let retryAfter = parseInt(ra, 10);
    if (!retryAfter || Number.isNaN(retryAfter)) {
      // base backoff in seconds scaled by factor (min 2s)
      retryAfter = Math.max(2, Math.pow(2, Math.min(__seha_backoffFactor, SEHA_BACKOFF_MAX_FACTOR)));
    }
    // set backoff in ms
    __seha_backoffUntil = Date.now() + (retryAfter * 1000);
    __seha_backoffFactor = Math.min(__seha_backoffFactor * 2, SEHA_BACKOFF_MAX_FACTOR);
    console.warn('SEHA: received 429, backing off for', retryAfter, 's (factor=', __seha_backoffFactor, ')');

    try { const j = await res.json(); return { ok: false, status: 429, data: j, rateLimited: true, retryAfter }; }
    catch(e){ return { ok: false, status: 429, data: null, rateLimited: true, retryAfter }; }
  }

  // success or other statuses -> reset factor for subsequent 429s
  __seha_backoffFactor = 1;

  try { const j = await res.json(); return { ok: res.ok, status: res.status, data: j }; }
  catch(e){ return { ok: res.ok, status: res.status, data: null }; }
}

/* ---- Modified start/stop convo pollers to respect backoff and avoid duplicate intervals ---- */
function stopConversationPoll() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
}
function startConversationPoll(convId, intervalMs = 5000) {
  // ensure single poll
  stopConversationPoll();

  // use a safe interval (5s default). We'll pause and resume if server signals 429.
  pollHandle = setInterval(async () => {
    if (!panel.classList.contains('show')) return;
    if (Date.now() < __seha_backoffUntil) {
      // skip while backoff active
      return;
    }
    const r = await apiFetch(`/api/help/conversations/${convId}`);
    if (!r.ok) {
      if (r.rateLimited) {
        // stop polling, schedule resume after backoff
        stopConversationPoll();
        const waitMs = (r.retryAfter || Math.ceil((__seha_backoffUntil - Date.now())/1000)) * 1000;
        setTimeout(()=> {
          // restart poll (use a slightly larger interval after rate-limit)
          if (panel.classList.contains('show')) startConversationPoll(convId, Math.max(5000, waitMs));
        }, waitMs);
      }
      return;
    }
    const conv = r.data.conversation;
    if (!conv) return;
    const knownUpdated = selectedConv && (selectedConv.updatedAt || selectedConv.lastMessageAt);
    if (!knownUpdated || (conv.updatedAt && conv.updatedAt !== selectedConv.updatedAt)) {
      selectedConv = conv;
      renderMessages(selectedConv.messages || []);
      saveLocalConversation(selectedConv);
    }
  }, intervalMs);
}

/* ---- Modified admin poll with safer defaults (8s) and backoff handling ---- */
function stopAdminPoll() {
  if (adminPollHandle) { clearInterval(adminPollHandle); adminPollHandle = null; }
}
function startAdminPoll(intervalMs = 8000) {
  if (adminPollHandle) return; // avoid duplicates
  adminPollHandle = setInterval(async () => {
    if (!panel.classList.contains('show')) return;
    if (Date.now() < __seha_backoffUntil) {
      return;
    }
    const r = await apiFetch('/api/help/conversations/admin/list');
    if (!r.ok) {
      if (r.rateLimited) {
        stopAdminPoll();
        const waitMs = (r.retryAfter || Math.ceil((__seha_backoffUntil - Date.now())/1000)) * 1000;
        setTimeout(()=> {
          if (panel.classList.contains('show')) startAdminPoll(Math.max(8000, waitMs));
        }, waitMs);
      } else {
        // show a gentle failure message once (but avoid spamming UI)
        console.warn('SEHA: admin list load failed, status', r.status);
      }
      return;
    }
    convs = r.data.conversations || [];
    renderAdminList(convs);
    if (convs.length && !selectedConv) openAdminConversation(convs[0]._id);
    const unreadTotal = convs.reduce((s,c)=> s + (c.unreadCount||0), 0);
    showBadge(unreadTotal);
  }, intervalMs);
}
