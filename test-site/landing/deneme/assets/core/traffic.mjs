const PAGES = new Set(['home', 'about', 'rooms', 'restaurant', 'menu', 'catalog', 'gallery', 'announcements', 'reviews', 'contact']);
const ITEM_PAGES = new Set(['rooms', 'restaurant', 'catalog', 'menu']);
const SOURCES = new Set(['search', 'social', 'referral', 'direct']);
const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|ecosia|baidu|ask)\./i;
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|twitter|x|linkedin|tiktok|youtube|pinterest|reddit|threads|tumblr)\./i;
const SESSION_KEY = 'ya-traffic-session';
const SESSION_WINDOW_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2500;

export function classifySource(referrer, origin) {
  const value = typeof referrer === 'string' ? referrer.trim() : '';
  if (value === '') return 'direct';
  let host = '';
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return 'direct';
  }
  let ownHost = '';
  try {
    ownHost = new URL(origin).hostname.toLowerCase();
  } catch {}
  if (host === '' || host === ownHost) return 'direct';
  if (SEARCH_HOSTS.test(host)) return 'search';
  if (SOCIAL_HOSTS.test(host)) return 'social';
  return 'referral';
}

export function resolvePage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const requested = parsed.searchParams.get('page') || (parsed.pathname.replace(/\/+$/, '') === '' ? 'home' : '');
  const page = requested.toLowerCase();
  if (!PAGES.has(page)) return null;
  // Canonical site routing uses ?page=menu&category=... and ?page=catalog&id|category=...
  const item = ITEM_PAGES.has(page)
    ? (parsed.searchParams.get('id') || parsed.searchParams.get('category') || '')
    : '';
  if (item !== '' && !/^[A-Za-z0-9._:-]{1,80}$/.test(item)) return null;
  return {page, item};
}

export function isTrackableLocation(url, view, documentElement) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.test')
    || host === '::1' || host === '[::1]' || /^127\./.test(host) || host === '0.0.0.0') return false;
  if (parsed.searchParams.get('preview') === '1') return false;
  if (documentElement?.dataset?.preview === 'true') return false;
  if (view && view.top !== view.self) return false;
  return true;
}

export function intentFromAnchor(href, explicit) {
  const declared = typeof explicit === 'string' ? explicit.toLowerCase() : '';
  if (['contact', 'call', 'route'].includes(declared)) return `intent_${declared}`;
  const value = typeof href === 'string' ? href.trim().toLowerCase() : '';
  if (value.startsWith('tel:')) return 'intent_call';
  if (value.startsWith('whatsapp:') || /^https?:\/\/(wa\.me|api\.whatsapp\.com)\//.test(value)) return 'intent_contact';
  if (/^https?:\/\/(maps\.google\.|www\.google\.[^/]+\/maps|maps\.app\.goo\.gl|yandex\.[^/]+\/maps)/.test(value)) return 'intent_route';
  return null;
}

function randomId(cryptoObject) {
  try {
    if (typeof cryptoObject?.randomUUID === 'function') return cryptoObject.randomUUID();
  } catch {}
  try {
    if (typeof cryptoObject?.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      cryptoObject.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  const entropy = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return (`t${entropy}`.replace(/[^A-Za-z0-9_-]/g, '') + '00000000').slice(0, 120);
}

function readSession(storage, now) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (parsed && typeof parsed.id === 'string' && /^[A-Za-z0-9_-]{8,120}$/.test(parsed.id)
      && Number.isFinite(parsed.seen) && now - parsed.seen <= SESSION_WINDOW_MS) return parsed;
  } catch {}
  return null;
}

function writeSession(storage, session) {
  if (!storage) return;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export function startTraffic(context = {}, runtime = {}) {
  const {document: doc = globalThis.document, location: loc = globalThis.location,
    sessionStorage: storage = globalThis.sessionStorage, fetch: fetchImpl = globalThis.fetch,
    crypto: cryptoObject = globalThis.crypto, window: view = globalThis.window,
    setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout,
    navigator: nav = globalThis.navigator} = runtime;
  if (!doc || !loc || typeof fetchImpl !== 'function') return false;
  if (context?.features?.traffic === false) return false;
  if (doc.visibilityState !== 'visible') return false;
  if (!isTrackableLocation(String(loc.href), view, doc.documentElement)) return false;
  const page = resolvePage(String(loc.href));
  if (!page) return false;
  if (typeof nav?.webdriver === 'boolean' && nav.webdriver) return false;

  const origin = String(loc.origin || '').replace(/\/$/, '');
  const endpoint = `${String(context.apiBasePath || '/yardimci-asistan').replace(/\/$/, '')}/api/traffic.php`;
  const source = classifySource(String(doc.referrer || ''), origin);
  const now = Date.now();
  let session = readSession(storage, now);
  if (!session) {
    session = {id: randomId(cryptoObject), seen: now};
  } else {
    session.seen = now;
  }
  writeSession(storage, session);

  const send = (event, item = page.item) => {
    const payload = {event, page: page.page, src: source, session: session.id, id: randomId(cryptoObject)};
    if (item) payload.item = item;
    const controller = typeof globalThis.AbortController === 'function' ? new globalThis.AbortController() : null;
    const timer = typeof schedule === 'function' && controller
      ? schedule(() => { try { controller.abort(); } catch {} }, REQUEST_TIMEOUT_MS) : null;
    try {
      Promise.resolve(fetchImpl(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        credentials: 'omit',
        keepalive: true,
        referrerPolicy: 'no-referrer',
        signal: controller?.signal
      })).catch(() => {}).finally(() => { if (timer && typeof cancel === 'function') cancel(timer); });
    } catch {}
  };

  // One view per real page load. The server deduplicates the idempotency key.
  send('view');

  // Only explicit CTA anchors; no global mouse, keyboard or scroll tracking.
  doc.addEventListener('click', event => {
    if (doc.visibilityState !== 'visible') return;
    const anchor = typeof event.target?.closest === 'function' ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const intent = intentFromAnchor(String(anchor.getAttribute('href') || ''), anchor.dataset?.trafficIntent);
    if (intent) send(intent, String(anchor.dataset?.trafficItem || page.item || ''));
  }, {capture: true, passive: true});

  return true;
}

/** Boot helper; tracking must never break the page. */
export function bootTraffic(context = {}, runtime = {}) {
  try {
    return startTraffic(context, runtime);
  } catch {
    return false;
  }
}

export {PAGES, SOURCES};
