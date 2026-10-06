import { createHash } from "node:crypto";

const fields = { publish_menu: "menu", publish_android_snapshot: "snapshot", publish_online_catalog: "online_catalog",
  publish_dealer_access: "dealer_access", publish_marketing_website: "marketing", publish_room_catalog: "room_catalog",
  publish_table_catalog: "table_catalog", publish_ai_catalog: "ai_catalog", publish_business_context: "business_context",
  publish_ai_settings: "ai_settings", publish_google_reviews_settings: "google_reviews", publish_public_room_availability: "availability" };
const revisions = new Map();

/** Fixture allocator only. Production ordering is always the durable Desktop outbox. */
export function publicationEnvelope(body, clientId = "desktop-fixture", epoch = 1) {
  const field = fields[body.action] ?? (body.availability ? "availability" : null);
  if (!field || !body[field]) return body;
  const client = body.client_id ?? clientId;
  const key = `${client}:${field}`;
  const revision = body.source_revision ?? (revisions.get(key) ?? 0) + 1;
  revisions.set(key, Math.max(revisions.get(key) ?? 0, revision));
  const json = JSON.stringify(body[field]);
  return { ...body, client_id: client, source_epoch: body.source_epoch ?? epoch, source_revision: revision,
    idempotency_key: body.idempotency_key ?? `${client}:${epoch}:${field}:${revision}`,
    publication_body: json, payload_hash: createHash("sha256").update(json).digest("hex") };
}

export function exactFixtureReceipt(body, overrides = {}) {
  return { accepted: true, publication_name: body.action === "publish_dealer_access" ? "dealer_access_private" : body.action.slice(8),
    source_client_id: body.client_id, source_epoch: body.source_epoch, source_revision: body.source_revision,
    idempotency_key: body.idempotency_key, payload_hash: body.payload_hash, server_revision: 1,
    published_at: "2026-10-06T00:00:00Z", deduplicated: false, ...overrides };
}

/** Explicit activation plus envelope enrichment for HTTP/Web-domain fixtures. */
export async function activateFixtureSource(baseUrl, secret, clientId) {
  const response = await fetch(`${baseUrl}/api/sync.php`, { method: "POST", headers: {
    "Content-Type": "application/json", "X-YA-Sync-Secret": secret
  }, body: JSON.stringify({ action: "activate_publication_source", client_id: clientId, expected_epoch: 0, activation_key: `${clientId}:activate:0` }) });
  if (!response.ok) throw new Error(`Fixture source activation failed: ${await response.text()}`);
  return response.json();
}

export function publicationFixturePost(request, clientId) {
  // One explicit fixture source across feature-labelled legacy input fixtures.
  return (url, options) => request.post(url, { ...options, data: publicationEnvelope({ ...options.data,
    ...(fields[options.data.action] ? { client_id: clientId } : {}) }, clientId) });
}

export function publicationFixtureFetch(url, init) {
  return fetch(url, { ...init, body: JSON.stringify(publicationEnvelope(JSON.parse(init.body))) });
}
