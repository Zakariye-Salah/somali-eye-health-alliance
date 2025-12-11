// donate.js
(() => {
  const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') 
  ? 'http://localhost:4000' 
  : 'https://somali-eye-health-alliance.onrender.com';  const donateForm = document.getElementById('donateForm');
  const donateMsg = document.getElementById('donateMsg');
  const presetBtns = Array.from(document.querySelectorAll('.amt'));
  const customInput = document.getElementById('customAmount');
  const clearBtn = document.getElementById('clearDonate');
  const paymentMethod = document.getElementById('paymentMethod');
  const offlineOptions = document.getElementById('offlineOptions');
  const offlineType = document.getElementById('offlineType');
  const mobileProviders = document.getElementById('mobileProviders');
  const mobileSenderName = document.getElementById('mobileSenderName');
  const confirmOfflineBtn = document.getElementById('confirmOfflineBtn');

  const LS_PENDING = 'seha_pending_donation';

  // wire preset amount buttons
  presetBtns.forEach(b => b.addEventListener('click', () => {
    presetBtns.forEach(x => x.classList.remove('btn-primary'));
    b.classList.add('btn-primary');
    customInput.value = b.dataset.amount;
  }));

  clearBtn.addEventListener('click', () => {
    donateForm.reset();
    presetBtns.forEach(x => x.classList.remove('btn-primary'));
    donateMsg.textContent = '';
    localStorage.removeItem(LS_PENDING);
  });

  // show/hide offline options
  function updateMethodUI() {
    const m = (paymentMethod.value || 'offline');
    if (m === 'offline' || m === 'mobile') {
      offlineOptions.style.display = 'block';
      // show mobile provider block only for mobile-money option
      mobileProviders.style.display = (m === 'mobile' || offlineType.value === 'mobile-money') ? 'block' : 'none';
      document.getElementById('bankInfo').style.display = m === 'offline' || offlineType.value === 'bank' ? 'block' : 'none';
    } else {
      offlineOptions.style.display = 'none';
    }
  }
  paymentMethod.addEventListener('change', updateMethodUI);
  offlineType.addEventListener('change', updateMethodUI);

  // confirm offline button opens a small UI to collect sender phone/name and tx id
  confirmOfflineBtn.addEventListener('click', () => {
    showConfirmUI();
  });

  function showConfirmUI(donationId, suggestedAmount) {
    // build a confirmation UI inline
    donateMsg.innerHTML = `
      <div>
        <label for="confirmPhone">Your phone (or sender phone)</label>
        <input id="confirmPhone" placeholder="+252612...">
        <label for="confirmSender" style="margin-top:8px">Name on account / sender name</label>
        <input id="confirmSender" placeholder="Name used when sending">
        <label for="confirmAmount" style="margin-top:8px">Amount you sent (USD)</label>
        <input id="confirmAmount" type="number" value="${suggestedAmount || ''}">
        <label for="confirmTx" style="margin-top:8px">Provider transaction id (optional)</label>
        <input id="confirmTx" placeholder="provider tx id">
        <div style="margin-top:8px">
          <button id="submitConfirm" class="btn">Submit confirmation</button>
        </div>
        <div id="confirmMsg" class="muted" style="margin-top:8px"></div>
      </div>
    `;
    document.getElementById('submitConfirm').addEventListener('click', async () => {
      const phone = document.getElementById('confirmPhone').value.trim();
      const sender = document.getElementById('confirmSender').value.trim();
      const amount = Number(document.getElementById('confirmAmount').value || 0);
      const tx = document.getElementById('confirmTx').value.trim();
      if (!phone || !amount) {
        document.getElementById('confirmMsg').textContent = 'Please provide phone and amount';
        return;
      }
      // If the donationId param wasn't provided, we need to create a pending donation first.
      // Try to find last pending id in localStorage (if anonymous) OR create a new donation with method=offline/mobile
      document.getElementById('confirmMsg').textContent = 'Submitting confirmation...';
      try {
        // try to reuse pending donation in LS
        let pending = null;
        try { pending = JSON.parse(localStorage.getItem(LS_PENDING)); } catch(e){}
        let donationIdToConfirm = donationId || (pending && pending.donationId) || null;
        if (!donationIdToConfirm) {
          // create donation record first (method offline/mobile)
          const payload = {
            donorName: document.getElementById('donorName').value || null,
            donorEmail: document.getElementById('donorEmail').value || null,
            amount: amount,
            frequency: (document.querySelector('input[name="frequency"]:checked')||{}).value || 'one-time',
            method: (paymentMethod.value === 'mobile') ? 'mobile' : 'offline',
            message: document.getElementById('donorMessage').value || '',
            mobileNumber: phone
          };
          const resp = await fetch(API_BASE + '/api/donations', {
            method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
          });
          const j = await resp.json();
          if (!resp.ok) {
            document.getElementById('confirmMsg').innerHTML = '<span class="error">' + (j.message || 'Create failed') + '</span>';
            return;
          }
          donationIdToConfirm = j.donation._id;
          localStorage.setItem(LS_PENDING, JSON.stringify({ donationId: donationIdToConfirm, createdAt: new Date().toISOString() }));
        }
        // now call confirm endpoint
        const confirmResp = await fetch(API_BASE + '/api/donations/confirm', {
          method: 'POST', headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ donationId: donationIdToConfirm, phoneNumber: phone, sentAmount: amount, providerTxId: tx })
        });
        const cj = await confirmResp.json();
        if (!confirmResp.ok) {
          document.getElementById('confirmMsg').innerHTML = '<span class="error">' + (cj.message || 'Confirm failed') + '</span>';
          return;
        }
        document.getElementById('confirmMsg').innerHTML = '<span class="success">Confirmation recorded. Admin will review and approve/deny.</span>';
      } catch (err) {
        console.error(err);
        document.getElementById('confirmMsg').innerHTML = '<span class="error">Network error</span>';
      }
    });
  }

// donate.js - mobile USSD & bank-account copy helpers
document.addEventListener('DOMContentLoaded', () => {
  // Provider USSD templates (change numbers here if needed)
  const USSD_TEMPLATES = {
    evc: '*712*617000264*{amount}#',
    zaad: '*111*617000264*{amount}#',
    mybessa: '*112*617000264*{amount}#'
  };
  const BANK_ACCOUNT = 'NO Account Please Contact us '; // the account number to show for bank transfer

  // DOM refs
  const presetBtns = document.querySelectorAll('.amt');
  const customAmount = document.getElementById('customAmount');
  const paymentMethod = document.getElementById('paymentMethod');
  const offlineOptions = document.getElementById('offlineOptions');
  const offlineType = document.getElementById('offlineType');
  const mobileProviders = document.getElementById('mobileProviders');
  const bankInfo = document.getElementById('bankInfo');
  const mobileProvider = document.getElementById('mobileProvider');
  const paymentInstructions = document.getElementById('paymentInstructions');

  // helper: get current amount (integer USD)
  function getSelectedAmount() {
    // priority: custom amount if > 0, else last selected preset with .selected
    let amount = 0;
    const v = Number((customAmount && customAmount.value) || 0);
    if (v && !isNaN(v) && v > 0) return Math.round(v);
    const chosen = document.querySelector('.amt.selected');
    if (chosen) return Number(chosen.dataset.amount) || 0;
    // fallback: first preset
    const first = document.querySelector('.amt');
    if (first) return Number(first.dataset.amount) || 0;
    return 0;
  }

  // update UI to reflect selected preset
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // clear custom input when picking preset (optional)
      if (customAmount) customAmount.value = '';
      refreshPaymentInstructions();
    });
  });

  // when custom amount changes, clear selected preset
  if (customAmount) {
    customAmount.addEventListener('input', () => {
      presetBtns.forEach(b => b.classList.remove('selected'));
      refreshPaymentInstructions();
    });
  }

  // show/hide offline options depending on top-level paymentMethod
  function refreshOfflineVisibility() {
    const method = (paymentMethod && paymentMethod.value) || '';
    if (method === 'offline' || method === 'mobile') {
      offlineOptions.style.display = 'block';
      // if paymentMethod is 'mobile' consider mobile-money by default
      if (method === 'mobile') {
        offlineType.value = 'mobile-money';
      }
    } else {
      offlineOptions.style.display = 'none';
      paymentInstructions.style.display = 'none';
    }
    // ensure UI for offlineType is applied
    refreshOfflineType();
  }

  // show/hide mobileProviders vs bankInfo based on offlineType
  function refreshOfflineType() {
    const t = offlineType.value;
    if (t === 'mobile-money') {
      mobileProviders.style.display = 'block';
      bankInfo.style.display = 'none';
    } else {
      mobileProviders.style.display = 'none';
      bankInfo.style.display = 'block';
    }
    refreshPaymentInstructions();
  }

  // Build and render instructions (USSD or bank account)
  function refreshPaymentInstructions() {
    const t = offlineType.value;
    const amount = getSelectedAmount();
    paymentInstructions.innerHTML = ''; // clear
    paymentInstructions.style.display = 'none';

    if (t === 'mobile-money') {
      const provider = (mobileProvider && mobileProvider.value) || 'evc';
      const template = USSD_TEMPLATES[provider] || USSD_TEMPLATES['evc'];
      if (!amount || amount <= 0) {
        // ask user to choose amount
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'Select or enter an amount to see the USSD code to dial.';
        paymentInstructions.appendChild(p);
        paymentInstructions.style.display = 'block';
        return;
      }
      const ussd = template.replace('{amount}', encodeURIComponent(String(amount)));
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '8px';

      // show the USSD in an input so mobile users can long-press / copy easily
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.readOnly = true;
      inp.value = ussd;
      inp.style.padding = '8px';
      inp.style.borderRadius = '8px';
      inp.style.border = '1px solid #e6eef0';
      inp.style.minWidth = '220px';
      wrapper.appendChild(inp);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn';
      copyBtn.style.padding = '8px 10px';
      copyBtn.innerHTML = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ussd);
          showCopied(copyBtn);
        } catch (e) {
          // fallback: select and prompt
          inp.select();
          document.execCommand && document.execCommand('copy');
          showCopied(copyBtn);
        }
      });
      wrapper.appendChild(copyBtn);

      // helper dial hint for mobile: small link to open dialer (on mobile most browsers support)
      const dialLink = document.createElement('a');
      dialLink.href = `tel:${ussd}`;
      dialLink.textContent = 'Dial now';
      dialLink.style.marginLeft = '6px';
      dialLink.style.fontSize = '13px';
      wrapper.appendChild(dialLink);

      paymentInstructions.appendChild(wrapper);
      paymentInstructions.style.display = 'block';
      return;
    }

    // bank transfer instructions
    if (t === 'bank') {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '8px';

      const accSpan = document.createElement('span');
      accSpan.id = 'displayBankAcc';
      accSpan.textContent = BANK_ACCOUNT;
      accSpan.style.fontWeight = '700';
      accSpan.style.padding = '8px';
      accSpan.style.borderRadius = '8px';
      accSpan.style.border = '1px solid #e6eef0';
      wrapper.appendChild(accSpan);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn';
      copyBtn.style.padding = '8px 10px';
      copyBtn.innerHTML = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(BANK_ACCOUNT);
          showCopied(copyBtn);
        } catch(e){
          // fallback: select text trick
          const ta = document.createElement('textarea');
          ta.value = BANK_ACCOUNT;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand && document.execCommand('copy');
          ta.remove();
          showCopied(copyBtn);
        }
      });
      wrapper.appendChild(copyBtn);

      const info = document.createElement('div');
      info.style.marginLeft = '8px';
      info.className = 'muted';
      info.textContent = 'Use this account number for bank transfer; then confirm transfer above.';
      paymentInstructions.appendChild(wrapper);
      paymentInstructions.appendChild(info);
      paymentInstructions.style.display = 'block';
      return;
    }

    // otherwise nothing
    paymentInstructions.style.display = 'none';
  }

  // small helper that shows "Copied!" text briefly
  function showCopied(btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = 'Copied ✔';
    setTimeout(()=> btn.innerHTML = orig, 1800);
  }

  // copy buttons for static bank account in markup (the one near #bankAccountNumber)
  document.querySelectorAll('.copy-btn').forEach(cb => {
    cb.addEventListener('click', async (ev) => {
      const sel = cb.getAttribute('data-copy-target');
      let text = '';
      if (sel) {
        const el = document.querySelector(sel);
        if (el) text = el.textContent.trim();
      }
      if (!text) {
        // fallback to bank account constant
        text = BANK_ACCOUNT;
      }
      try {
        await navigator.clipboard.writeText(text);
        showCopied(cb);
      } catch(e){
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand && document.execCommand('copy'); ta.remove();
        showCopied(cb);
      }
    });
  });

  // event listeners
  if (paymentMethod) paymentMethod.addEventListener('change', refreshOfflineVisibility);
  if (offlineType) offlineType.addEventListener('change', refreshOfflineType);
  if (mobileProvider) mobileProvider.addEventListener('change', refreshPaymentInstructions);
  if (customAmount) customAmount.addEventListener('blur', refreshPaymentInstructions);

  // if page loads and paymentMethod is mobile, show options
  refreshOfflineVisibility();
  refreshPaymentInstructions();

  // Optional: also update when user types amount instantly
  if (customAmount) customAmount.addEventListener('input', () => {
    // only update after a brief debounce to be not too chatty
    clearTimeout(customAmount._deb);
    customAmount._deb = setTimeout(refreshPaymentInstructions, 250);
  });
});



  // form submit: create donation (general flow). For non-offline methods, it returns different payloads.
  donateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    donateMsg.textContent = '';
    const name = document.getElementById('donorName').value.trim() || null;
    const email = document.getElementById('donorEmail').value.trim() || null;
    const amount = Number((customInput.value || 0));
    const freq = (document.querySelector('input[name="frequency"]:checked')||{}).value || 'one-time';
    const methodVal = paymentMethod.value || 'offline';
    const message = document.getElementById('donorMessage').value || '';
    if (!email || !amount || isNaN(amount) || amount <= 0) {
      donateMsg.textContent = 'Please enter a valid email and donation amount.';
      return;
    }
    donateMsg.textContent = 'Creating donation...';
    try {
      const payload = { donorName: name, donorEmail: email, amount, frequency: freq, method: (methodVal==='mobile'?'mobile':methodVal), message };
      const resp = await fetch(API_BASE + '/api/donations', {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
      });
      const j = await resp.json();
      if (!resp.ok) {
        donateMsg.innerHTML = '<span class="error">' + (j.message || 'Create failed') + '</span>';
        return;
      }

      const donation = j.donation;
      // store pending for anonymous user
      if (!window.currentUser) {
        localStorage.setItem(LS_PENDING, JSON.stringify({ donationId: donation._id, createdAt: new Date().toISOString() }));
      }

      // respond differently by method
      if (payload.method === 'mobile') {
        const ussd = j.ussd || (donation.meta && donation.meta.ussd) || null;
        donateMsg.innerHTML = `<div>Mobile donation initiated. Dial <strong>${ussd || 'the provider USSD'}</strong> to send payment, then confirm on this page.</div>
          <div style="margin-top:8px"><button id="confirmMobile" class="btn">Confirm payment</button></div>`;
        document.getElementById('confirmMobile').addEventListener('click', () => showConfirmUI(donation._id, donation.amount));
        return;
      }

      if (payload.method === 'offline') {
        // show bank info returned by server or from env placeholders on the page
        const bank = j.bankInfo || {
          bank: document.getElementById('bankName').textContent,
          branch: '',
          accountName: document.getElementById('bankAccountName').textContent,
          accountNumber: document.getElementById('bankAccountNumber').textContent,
          email: document.getElementById('bankEmail').textContent
        };
        donateMsg.innerHTML = `<div>Offline donation recorded (pending). Please transfer using the details below and click Confirm after you transfer.</div>
         <div style="margin-top:8px"><strong>Bank:</strong> ${bank.bank} — ${bank.branch}<br><strong>Account:</strong> ${bank.accountName} — ${bank.accountNumber}<br>Email for receipts: ${bank.email}</div>
         <div style="margin-top:8px">Your donation ID: <code>${donation._id}</code></div>
         <div style="margin-top:8px"><button id="confirmOfflineNow" class="btn">I have transferred / Confirm</button></div>`;
        document.getElementById('confirmOfflineNow').addEventListener('click', () => showConfirmUI(donation._id, donation.amount));
        return;
      }

      // for stripe/paypal placeholder: inform user that payment provider integration is pending
      if (payload.method === 'stripe' || payload.method === 'paypal') {
        donateMsg.innerHTML = `<span class="muted">Payment provider integration placeholder. Admin will process or you will be redirected when integration is configured.</span>`;
        return;
      }

      donateMsg.innerHTML = `<span class="success">Donation recorded (demo). Thank you!</span>`;
    } catch (err) {
      console.error(err);
      donateMsg.innerHTML = '<span class="error">Network error</span>';
    }
  });

  // If we have a pending donation in storage, show quick action
  (function checkPending(){
    try {
      const p = JSON.parse(localStorage.getItem(LS_PENDING));
      if (!p || !p.donationId) return;
      donateMsg.innerHTML = `<div>You have a pending donation (ID: <code>${p.donationId}</code>). <button id="checkDonationStatus" class="btn">Check status</button></div>`;
      document.getElementById('checkDonationStatus').addEventListener('click', async () => {
        donateMsg.textContent = 'Checking...';
        try {
          const resp = await fetch(API_BASE + `/api/donations/${p.donationId}`);
          const j = await resp.json();
          if (!resp.ok) { donateMsg.innerHTML = '<span class="error">' + (j.message || 'Check failed') + '</span>'; return; }
          const d = j.donation;
          donateMsg.innerHTML = `<div>Donation status: <strong>${d.status}</strong> (method: ${d.method}).</div>
            <div style="margin-top:8px"><button id="openConfirm" class="btn secondary">Submit confirmation / details</button></div>`;
          document.getElementById('openConfirm').addEventListener('click', () => showConfirmUI(d._id, d.amount));
        } catch (err) { console.error(err); donateMsg.innerHTML = '<span class="error">Network error</span>'; }
      });
    } catch(e){}
  })();

  // --- Admin-only "Check donations" button logic ---
// Shows the "Check donations" button only when the logged-in user is admin/superadmin.
(async function adminCheck() {
  try {
    const btn = document.getElementById('checkDonationsBtn');
    if (!btn) return;

    // token storage key used by your admin UI
    const token = localStorage.getItem('seha_token') || null;
    if (!token) return; // no token -> don't show

    const resp = await fetch(API_BASE + '/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
      // not authorized -> don't show
      return;
    }

    const data = await resp.json();
    const user = data && data.user ? data.user : null;
    if (!user || !user.role) return;

    const role = String(user.role).toLowerCase();
    if (role === 'admin' || role === 'superadmin') {
      // show button and attach click
      btn.style.display = 'inline-block';
      btn.addEventListener('click', (e) => {
        // navigate to admin donations page - adjust path if your admin UI lives elsewhere
        window.location.href = 'admin/donations.html';
      });
    }
  } catch (err) {
    // network or unexpected error — silently do nothing (button stays hidden)
    console.error('Admin check failed', err);
  }
})();

})();
