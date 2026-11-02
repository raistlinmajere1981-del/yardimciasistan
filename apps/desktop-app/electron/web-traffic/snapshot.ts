/** Dashboard-only, read-only report. The sync secret never enters the renderer. */
export interface SiteTrafficDay { date: string; sessions: number; views: number; intents: number }
export interface SiteTrafficRanking { page: string; count: number }
export interface SiteTrafficSnapshot {
  enabled: boolean;
  has_data: boolean;
  days: 7 | 30;
  totals: { sessions: number; views: number; intents: number };
  /** Desktop-confirmed canonical rows; never derived from browser clicks. */
  conversions: { requests: number; orders: number } | null;
  daily: SiteTrafficDay[];
  top_pages: SiteTrafficRanking[];
  sources: { source: string; count: number }[];
  last_collected_at: string | null;
}
export type SiteTrafficResult =
  | { ok: true; value: SiteTrafficSnapshot; stale: boolean; fetchedAt: string }
  | { ok: false; message: string; stale: false };

export interface TrafficConnection { baseUrl: string; syncSecret: string }
type Fetcher = typeof fetch;
const TTL = 5 * 60 * 1000;
const reportCache = new Map<string, { value: SiteTrafficSnapshot; fetchedAt: string; time: number }>();
const number = (input: unknown) => typeof input === "number" && Number.isSafeInteger(input) && input >= 0 ? input : 0;
const record = (input: unknown): Record<string, unknown> => input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
const safeDate = (input: unknown): string | null => typeof input === "string" && Number.isFinite(Date.parse(input)) ? input : null;

export function normalizeTrafficSnapshot(input: unknown, days: 7 | 30): SiteTrafficSnapshot {
  const raw = record(input), totals = record(raw.totals ?? raw);
  if (raw.ok !== true || typeof raw.has_data !== "boolean" || !Array.isArray(raw.daily)) throw Error("invalid_traffic_snapshot");
  const conversions = raw.conversions && typeof raw.conversions === "object" && !Array.isArray(raw.conversions)
    ? { requests: number(record(raw.conversions).requests), orders: number(record(raw.conversions).orders) }
    : null;
  return {
    enabled: raw.enabled !== false,
    has_data: raw.has_data, days,
    totals: { sessions: number(totals.sessions), views: number(totals.views), intents: number(totals.intents) },
    conversions,
    daily: (raw.daily as unknown[]).slice(-days).map(row => {
      const d = record(row);
      return { date: typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : "", sessions: number(d.sessions), views: number(d.views), intents: number(d.intents) };
    }).filter(d => Boolean(d.date)),
    top_pages: (Array.isArray(raw.top_pages) ? raw.top_pages : []).slice(0, 5).map(row => {
      const r = record(row); return { page: String(r.page ?? "").slice(0, 90), count: number(r.views ?? r.count) };
    }).filter(p => p.page),
    sources: (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 8).map(row => {
      const r = record(row); return { source: String(r.source ?? "").slice(0, 40), count: number(r.sessions ?? r.count) };
    }).filter(s => s.source),
    last_collected_at: safeDate(raw.last_collected_at)
  };
}

export async function readSiteTrafficSnapshot(
  config: TrafficConnection,
  days: 7 | 30,
  fresh = false,
  fetcher: Fetcher = fetch,
  now = Date.now()
): Promise<SiteTrafficResult> {
  const base = config.baseUrl?.trim().replace(/\/+$/, "") || "";
  const secret = config.syncSecret?.trim() || "";
  let endpoint: URL;
  try {
    endpoint = new URL(`${base}/api/sync.php`);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) throw Error("not_https");
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !secret) throw Error("invalid_config");
  } catch { return { ok: false, message: "Web bağlantısı yapılandırılmadı.", stale: false }; }
  // Source identity is isolated by URL and a digest of the secret. Never expose this key in UI.
  const { createHash } = await import("node:crypto");
  const key = createHash("sha256").update(endpoint.origin + endpoint.pathname + secret + days).digest("hex");
  const cached = reportCache.get(key);
  if (!fresh && cached && now - cached.time < TTL) return { ok: true, value: cached.value, stale: false, fetchedAt: cached.fetchedAt };
  try {
    const response = await fetcher(endpoint, {
      method: "POST", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-YA-Sync-Secret": secret },
      body: JSON.stringify({ action: "traffic_snapshot", days }),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw Error(`http_${response.status}`);
    const json = await response.json();
    const value = normalizeTrafficSnapshot(json, days);
    const fetchedAt = new Date(now).toISOString();
    reportCache.set(key, { value, fetchedAt, time: now });
    return { ok: true, value, stale: false, fetchedAt };
  } catch {
    if (cached) return { ok: true, value: cached.value, stale: true, fetchedAt: cached.fetchedAt };
    return { ok: false, message: "Site trafiği raporuna ulaşılamıyor.", stale: false };
  }
}
