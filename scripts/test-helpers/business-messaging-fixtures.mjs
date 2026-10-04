import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const base = new URL('../../apps/desktop-app/dist-electron/business-messaging/', import.meta.url);
const compiledRequire = createRequire(new URL('service.js', base));
export const credentials = { wabaId: '1001', phoneNumberId: '2002', accessToken: 'fixture_TOKEN_only' };
export const configuration = { ...credentials, enabled: true };
export function secretFixture() {
  let available = true, backend = 'gnome_libsecret';
  const exports = {};
  runInNewContext(readFileSync(new URL('secret-service.js', base), 'utf8'), { exports, Buffer, process: { platform: 'linux' }, Error,
    require: () => ({ safeStorage: {
      isEncryptionAvailable: () => available, getSelectedStorageBackend: () => backend,
      encryptString: (value) => Buffer.from([...value].reverse().join('')),
      decryptString: (value) => [...value.toString()].reverse().join('')
    } }) });
  return { ...exports, setAvailable: (value) => { available = value; }, setBackend: (value) => { backend = value; } };
}
export function providerFixture() {
  const calls = [], state = { reject: false, lost: false, malformed: false, mismatch: false, duplicate: false, delay: null, templates: null };
  const templates = [{ name: 'fixture_template', language: 'tr', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Sipariş {{1}} hazır.' }] },
    { name: 'named_template', language: 'en_US', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hello {{first_name}}' }] },
    { name: 'pending', language: 'tr', category: 'UTILITY', status: 'PENDING', components: [] },
    { name: 'disabled', language: 'tr', category: 'UTILITY', status: 'DISABLED', components: [] },
    { name: 'media_template', language: 'tr', category: 'UTILITY', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Picture' }] }];
  let seq = 0;
  const fetchImpl = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (state.malformed) return new Response('{broken');
    if (path.endsWith('/phone_numbers')) return Response.json({ data: [{ id: state.mismatch ? '3333' : credentials.phoneNumberId, display_phone_number: '+90 555 000 00 00' }] });
    if (path.endsWith('/2002')) return Response.json({ id: credentials.phoneNumberId, display_phone_number: '+90 555 000 00 00' });
    if (path.endsWith('/message_templates')) return Response.json({ data: state.templates ?? templates });
    if (path.endsWith('/messages')) {
      if (state.delay) await state.delay;
      if (state.reject) return Response.json({ error: { code: 131026, message: 'fixture_TOKEN_only 905550000000 PARAMETER_PRIVATE CUSTOMER_PRIVATE' } }, { status: 400 });
      if (state.lost) throw new Error('fixture_TOKEN_only 905550000000 PARAMETER_PRIVATE CUSTOMER_PRIVATE');
      return Response.json({ messaging_product: 'whatsapp', messages: [{ id: state.duplicate ? 'wamid.fixture1' : `wamid.fixture${++seq}` }] });
    }
    throw new Error('Unexpected fixture route');
  };
  return { fetchImpl, state, calls, templates };
}
export function serviceFixture(getDatabase, http, secrets, logs = []) {
  const exports = {};
  runInNewContext(readFileSync(new URL('service.js', base), 'utf8'), { exports, Error,
    require: (name) => {
      if (name === './secret-service') return secrets;
      if (name === '../desktop-logger') return { desktopLog: { info: (event) => logs.push(event), warn: (event) => logs.push(event), error: (event) => logs.push(event) } };
      return compiledRequire(name);
    } });
  return new exports.BusinessMessagingService(getDatabase, { fetchImpl: http.fetchImpl, timeoutMs: 100 });
}
export function statusSyncFixture(getDatabase, onChanged, fetchImpl, logs = []) {
  const exports = {};
  runInNewContext(readFileSync(new URL('status-sync-service.js', base), 'utf8'), { exports, Error, URL, Buffer, AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
    require: (name) => name === '../desktop-logger' ? { desktopLog: { info: (event) => logs.push(event), warn: (event) => logs.push(event), error: (event) => logs.push(event) } } : name === './service' ? { messagingAccountKey: (waba, phone) => compiledRequire('node:crypto').createHash('sha256').update(`${waba}:${phone}`).digest('hex') } : compiledRequire(name) });
  return new exports.BusinessMessagingStatusSyncService(getDatabase, onChanged, fetchImpl);
}
