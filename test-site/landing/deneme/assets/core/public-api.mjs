const reads = new Set(['business', 'rooms', 'tables', 'menu', 'catalog', 'marketing', 'google-reviews']);
const writes = {chat: 'chat', request: 'requests', order: 'orders', availability: 'availability'};

export class PublicApiError extends Error {
  constructor(code, status = 0, payload = null) {
    super(code);
    this.name = 'PublicApiError';
    this.status = status;
    this.payload = payload;
  }
}

/** Transport only. No price calculation, publication writes, credential or automatic retry. */
export function createIntegrations({apiBasePath, features, language}) {
  if (!/^(?:\/[A-Za-z0-9_-]+)*$/.test(apiBasePath)) throw new PublicApiError('invalid_api_path');
  async function call(endpoint, method, payload, {signal} = {}) {
    const response = await fetch(`${apiBasePath}/api/${endpoint}.php`, {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: {Accept: 'application/json', ...(method === 'POST' ? {'Content-Type': 'application/json'} : {})},
      ...(method === 'POST' ? {body: JSON.stringify(payload)} : {}),
    });
    let body;
    try { body = await response.json(); } catch { throw new PublicApiError('invalid_api_response', response.status); }
    if (!response.ok) throw new PublicApiError('api_rejected', response.status, body);
    return body;
  }
  return Object.freeze({
    read(endpoint, options) {
      if (!reads.has(endpoint)) throw new PublicApiError('unknown_public_endpoint');
      return call(endpoint, 'GET', undefined, options);
    },
    send(endpoint, payload, options) {
      if (!Object.hasOwn(writes, endpoint) || features?.[writes[endpoint]] !== true) throw new PublicApiError('feature_unavailable');
      // Caller keeps the draft and idempotency key; canonical API validates the operation.
      return call(endpoint, 'POST', {...payload, language: language?.code ?? 'tr', ...(endpoint === 'chat' ? {response_language:language?.code ?? 'tr'} : {})}, options);
    },
  });
}
