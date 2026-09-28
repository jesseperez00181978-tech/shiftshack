(() => {
  'use strict';
  const PRODUCT = 'shiftstack_premium';
  const PACKAGE = 'com.jesseperez.shiftstack';
  const METHOD = 'https://play.google.com/billing';
  const ENDPOINT = 'https://shiftshack.vercel.app/api/shiftstack-billing';
  let service, item, ready = false, busy = false, restoring, expires = 0, verifiedUntil = 0, timer;
  const active = () => Date.now() < Math.min(expires, verifiedUntil);
  const el = id => document.getElementById(id);
  function sync() {
    const enabled = active();
    const button = document.querySelector('.premium-btn');
    if (button) button.textContent = enabled ? '⭐ ShiftStack Premium — Active' : '⭐ ShiftStack Premium';
    const panel = document.querySelector('.premium-workflow-panel');
    if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? 'block' : 'none'; }
    if (el('ssSubscribe')) { el('ssSubscribe').disabled = busy || !ready || enabled; el('ssSubscribe').textContent = enabled ? 'Premium active' : 'Subscribe'; }
    if (el('ssRestore')) el('ssRestore').disabled = busy;
    if (el('ssRetry')) el('ssRetry').disabled = busy;
    window.dispatchEvent(new CustomEvent('shiftstack-premium-change', {detail:{active:enabled}}));
  }
  function setEntitlement(data) {
    expires = data.active === true && data.productId === PRODUCT ? Number(data.expiresAt) || 0 : 0;
    verifiedUntil = Date.now() + 5 * 60 * 1000;
    clearTimeout(timer);
    if (active()) timer = setTimeout(sync, Math.max(1, Math.min(expires, verifiedUntil) - Date.now() + 10));
    sync();
    return active();
  }
  function status(message) { if (el('ssStatus')) el('ssStatus').textContent = message; }
  async function api(body) {
    const response = await fetch(ENDPOINT, {method:body ? 'POST' : 'GET', cache:'no-store', headers:body ? {'Content-Type':'application/json'} : {}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(25000)});
    const data = await response.json().catch(() => ({error:'Subscription service is unavailable. Try again shortly.'}));
    if (!response.ok) { const error = Error(data.error || 'Purchase verification is unavailable.'); error.status = response.status; throw error; }
    return data;
  }
  async function connect() {
    if (service) return service;
    if (!window.getDigitalGoodsService) throw Error('Open the Google Play-installed version of ShiftStack to subscribe or restore purchases.');
    service = await window.getDigitalGoodsService(METHOD);
    if (!service) throw Error('Google Play Billing is unavailable in this installation.');
    return service;
  }
  async function restore() {
    if (restoring) return restoring;
    restoring = (async () => {
      const purchases = await (await connect()).listPurchases();
      let failure;
      for (const purchase of purchases.filter(p => p.itemId === PRODUCT && p.purchaseToken)) {
        try {
          const result = await api({productId:PRODUCT, purchaseToken:purchase.purchaseToken});
          if (result.active) return setEntitlement(result);
        } catch (error) { if (error.status !== 400) failure = error; }
      }
      if (failure) throw failure;
      return setEntitlement({active:false});
    })();
    try { return await restoring; } finally { restoring = null; }
  }
  async function prepare() {
    ready = false; sync();
    const svc = await connect();
    if (!window.PaymentRequest) throw Error('Checkout is unavailable. You can still restore an existing purchase.');
    const config = await api();
    if (!config.ready || config.productId !== PRODUCT) throw Error('Premium checkout is being configured. No payment has been taken.');
    item = (await svc.getDetails([PRODUCT])).find(p => p.itemId === PRODUCT);
    if (!item?.price || item.subscriptionPeriod !== 'P1M') throw Error('The monthly Premium plan is not available from Google Play yet.');
    el('ssPrice').textContent = new Intl.NumberFormat(navigator.language, {style:'currency', currency:item.price.currency}).format(Number(item.price.value)) + ' / month';
    ready = true; sync();
  }
  async function purchase() {
    if (busy || !ready || active()) return;
    busy = true; sync(); status('Waiting for Google Play…');
    let response;
    try {
      // Keep show() directly in the click gesture; product/config loading happens beforehand.
      response = await new PaymentRequest([{supportedMethods:METHOD,data:{sku:PRODUCT}}], {total:{label:'ShiftStack Premium',amount:item.price}}).show();
      const token = response.details?.purchaseToken;
      if (!token) throw Error('Purchase confirmation is pending. Use Restore purchases before trying again.');
      const result = await api({productId:PRODUCT,purchaseToken:token});
      const enabled = setEntitlement(result);
      await response.complete(enabled ? 'success' : 'unknown'); response = null;
      status(enabled ? 'Premium is active. Your career tools are ready.' : 'The purchase is pending or inactive. Use Restore purchases to check again.');
    } catch (error) {
      if (response) await response.complete('unknown').catch(() => {});
      status(error.name === 'AbortError' ? 'Checkout canceled.' : error.message);
    } finally { busy = false; sync(); }
  }
  async function refresh() {
    if (busy) return;
    busy = true; sync(); status('Checking Premium…');
    const results = await Promise.allSettled([prepare(), restore()]);
    const error = results.find(r => r.status === 'rejected');
    status(error ? error.reason.message : active() ? 'Premium is active.' : 'No active subscription found. Subscribe or restore a purchase.');
    busy = false; sync();
  }
  window.showPremium = function() {
    let dialog = el('ssPremiumDialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'ssPremiumDialog'; dialog.setAttribute('aria-labelledby','ssPremiumTitle');
      dialog.style.cssText = 'box-sizing:border-box;width:min(92vw,480px);max-height:85vh;overflow:auto;padding:24px;border:1px solid #00bcca;border-radius:16px;background:#171717;color:#fff;';
      dialog.innerHTML = '<h2 id="ssPremiumTitle">⭐ ShiftStack Premium</h2><p>Interview preparation and offer comparison tools for your job search.</p><p id="ssPrice"></p><p>Monthly subscription. Renews automatically until canceled through Google Play.</p><p id="ssStatus" role="status" aria-live="polite"></p><div style="display:flex;flex-wrap:wrap;gap:10px"><button id="ssSubscribe" disabled>Subscribe</button><button id="ssRestore">Restore purchases</button><button id="ssRetry">Retry</button></div><p><a style="color:#00f2fe" href="https://play.google.com/store/account/subscriptions?sku='+PRODUCT+'&package='+PACKAGE+'" target="_blank" rel="noopener">Manage subscription in Google Play</a></p><form method="dialog"><button>Close</button></form>';
      document.body.appendChild(dialog);
      el('ssSubscribe').onclick = purchase;
      el('ssRetry').onclick = refresh;
      el('ssRestore').onclick = async () => {
        if (busy) return; busy = true; sync(); status('Restoring purchases…');
        try { status(await restore() ? 'Premium restored. Your career tools are ready.' : 'No active Premium subscription found for this Google Play account.'); }
        catch (error) { status(error.message); }
        finally { busy = false; sync(); }
      };
    }
    if (!dialog.open) dialog.showModal();
    refresh();
  };
  sync();
  restore().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) restore().catch(() => {}); });
  setInterval(() => { if (!document.hidden && !busy) restore().catch(() => {}); }, 4 * 60 * 1000);
})();
