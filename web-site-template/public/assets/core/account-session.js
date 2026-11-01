(() => {
  'use strict';
  let apiBase = '/yardimci-asistan';
  try { apiBase = JSON.parse(document.getElementById('site-context')?.textContent || '{}').apiBasePath || apiBase; } catch {}
  const listeners = new Set();
  const markerKey = `ya:account:${apiBase}:change`;
  const blockKey = `ya:account:${apiBase}:blocked`;
  let blocked = false, logoutPending = false;
  try { const saved = sessionStorage.getItem(blockKey); blocked = Boolean(saved); logoutPending = saved === 'pending'; } catch {}
  let state = Object.freeze({status: logoutPending ? 'unavailable' : 'guest', account: null, generation: 0, reason:'initial'});
  let pending = null, loginSucceeded = false, loginInProgress = false;
  const identity = account => account ? JSON.stringify([account.id, account.dealer || null]) : '';
  const snapshot = () => state;
  const emit = () => { for (const listener of listeners) { try { listener(state); } catch { /* An observer cannot prevent other private views closing. */ } } };
  const broadcast = action => { try { localStorage.setItem(markerKey, JSON.stringify({action, nonce: crypto.randomUUID()})); } catch {} };
  const fenceError = () => Object.assign(new Error('account_state_changed'), {code: 'account_state_changed'});
  function clear(reason = 'guest') {
    state = Object.freeze({status: logoutPending || ['unavailable', 'offline', 'hidden', 'pagehide'].includes(reason) ? 'unavailable' : 'guest', account: null, generation: state.generation + 1, reason});
    pending = null;
    emit();
    return state;
  }
  function block() {
    blocked = true; logoutPending = true;
    loginSucceeded = false;
    try { sessionStorage.setItem(blockKey, 'pending'); } catch {}
  }
  async function raw(file, body) {
    const response = await fetch(new URL(`${apiBase}/api/account/${file}.php`, location.origin), {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(20000),
      ...(body === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-YA-Account': '1'}, body: JSON.stringify(body)})
    });
    let value;
    try { value = await response.json(); } catch { value = null; }
    if (!response.ok || !value || typeof value !== 'object' || value.ok === false) {
      throw Object.assign(new Error(value?.code || 'account_unavailable'), {code: value?.code || 'account_unavailable', status: response.status, unavailable: response.ok});
    }
    return value;
  }
  function refresh() {
    if (loginInProgress || blocked || document.hidden || navigator.onLine === false) return Promise.resolve(state);
    if (pending) return pending;
    const started = state.generation;
    const operation = (async () => {
      try {
        let result;
        try { result = await raw('session'); }
        catch (error) {
          if (started !== state.generation) return state;
          if (error.status !== 401) throw error;
          await raw('refresh', {});
          if (started !== state.generation) return state;
          result = await raw('session');
        }
        if (started !== state.generation || blocked || document.hidden) return state;
        if (!result.account || typeof result.account.id !== 'string') throw new Error('account_unavailable');
        const changed = identity(state.account) !== identity(result.account);
        const hadAccount = Boolean(state.account);
        const account = Object.freeze({...result.account, methods: Object.freeze([...(result.account.methods || [])]), dealer: result.account.dealer ? Object.freeze({...result.account.dealer}) : null});
        state = Object.freeze({status: 'authenticated', account, generation: state.generation + Number(changed), reason:'verified'});
        emit();
        if (changed && hadAccount) broadcast('changed');
      } catch (error) {
        if (started === state.generation) clear(error.status === 401 ? 'guest' : 'unavailable');
      }
      return state;
    })();
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = null; });
    return operation;
  }
  async function request(file, body) {
    if (!/^[a-z-]+$/.test(file)) throw new Error('invalid_account_endpoint');
    const publicFiles = ['config', 'login', 'register', 'recover', 'verify', 'reset', 'oauth'];
    if (blocked && !publicFiles.includes(file)) throw fenceError();
    // A guest session refresh may be rotating cookies while the user signs in.
    // Finish that operation first, then prevent background refreshes until login resolves.
    if (file === 'login') {
      if (pending) await pending;
      loginInProgress = true;
    }
    const started = state.generation;
    try {
      const value = await raw(file, body);
      if (file !== 'config' && started !== state.generation) throw fenceError();
      if (file === 'login') loginSucceeded = true;
      return value;
    } catch (error) {
      if (started !== state.generation) throw fenceError();
      if (error.status === 401 || error.status === 403) clear(error.status === 401 ? 'guest' : 'unavailable');
      else if (!error.status || error.status >= 500 || error.unavailable) clear('unavailable');
      throw error;
    } finally {
      if (file === 'login') loginInProgress = false;
    }
  }
  function unlock() {
    if (!loginSucceeded) return;
    blocked = false; logoutPending = false; loginSucceeded = false;
    try { sessionStorage.removeItem(blockKey); } catch {}
    clear('guest');
    broadcast('changed');
  }
  async function logout(all = false) {
    block(); clear('unavailable'); broadcast('logout');
    // Only confirmed server logout permits guest checkout with the browser cookies.
    const result = await raw(all ? 'logout-all' : 'logout', {});
    if (blocked) {
      logoutPending = false;
      try { sessionStorage.setItem(blockKey, '1'); } catch {}
      clear('guest');
      broadcast('logout-complete');
    }
    return result;
  }
  window.YaAccount = Object.freeze({get state() { return snapshot(); }, getState: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh, request, clear, logout, unlock, get ready() { return ready; }});
  window.addEventListener('offline', () => clear('offline'));
  window.addEventListener('online', () => { void refresh(); });
  window.addEventListener('pagehide', () => clear('pagehide'));
  window.addEventListener('pageshow', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear('hidden'); else void refresh(); });
  window.addEventListener('storage', event => {
    if (event.key !== markerKey || !event.newValue) return;
    let marker; try { marker = JSON.parse(event.newValue); } catch { return; }
    if (marker.action === 'logout') { block(); clear('unavailable'); }
    else if (marker.action === 'logout-complete' && blocked) {
      logoutPending = false;
      try { sessionStorage.setItem(blockKey, '1'); } catch {}
      clear('guest');
    } else if (marker.action === 'changed') {
      if (blocked) { block(); clear('unavailable'); }
      else { clear('guest'); void refresh(); }
    }
  });
  setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
  const ready = refresh();
})();
