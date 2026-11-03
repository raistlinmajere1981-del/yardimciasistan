import { createHash } from "node:crypto";
import type { PublicSiteCatalog } from "@yardimci-asistan/shared";

export function validateSiteCatalog(value: unknown): PublicSiteCatalog {
  const catalog = value as PublicSiteCatalog;
  if (!catalog || catalog.version !== 1 || catalog.source_language !== "tr" || !/^[a-z0-9-]{1,60}$/.test(catalog.id)
    || !/^[a-f0-9]{64}$/.test(catalog.revision) || !catalog.entries || typeof catalog.entries !== "object" || Array.isArray(catalog.entries)) throw Error("invalid_site_catalog");
  const entries = Object.entries(catalog.entries);
  if (!entries.length || entries.length > 2048) throw Error("invalid_site_catalog");
  for (const [key, entry] of entries) {
    if (!/^[a-zA-Z0-9_.-]{1,120}$/.test(key) || !entry || typeof entry.text !== "string" || !entry.text.trim() || entry.text.length > 12000
      || /[<>\u0000-\u0008]/u.test(entry.text) || createHash("sha256").update(entry.text).digest("hex") !== entry.hash) throw Error("invalid_site_catalog");
  }
  const revision = createHash("sha256").update(entries.sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${key}:${entry.hash}\n`).join("")).digest("hex");
  if (revision !== catalog.revision) throw Error("invalid_site_catalog_revision");
  return {version:1,id:catalog.id,revision,source_language:"tr",entries:Object.fromEntries(entries.map(([key, entry]) => [key,{text:entry.text,hash:entry.hash}]))};
}

/** A template lives beside its API module, also under subdirectory installations.
 * No sync credential is ever sent to the presentation endpoint. */
export async function readPublicSiteCatalog(moduleUrl: string, fetcher: typeof fetch = fetch): Promise<PublicSiteCatalog | null> {
  const module = new URL(moduleUrl.replace(/\/+$/, "") + "/");
  if (!/^https?:$/.test(module.protocol) || module.username || module.password || module.search || module.hash) throw Error("invalid_site_url");
  const url = new URL("../?resource=translation-source", module);
  const response = await fetcher(url, {redirect:"error", credentials:"omit", signal:AbortSignal.timeout(10000), headers:{Accept:"application/json"}});
  // Existing non-template sites remain supported without a source catalog.
  if (response.status === 404 || !response.headers.get("content-type")?.includes("application/json")) return null;
  if (!response.ok || !response.body) throw Error("site_catalog_unavailable");
  let size = 0; const chunks: Uint8Array[] = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 512 * 1024) { await response.body.cancel().catch(() => {}); throw Error("site_catalog_too_large"); }
    chunks.push(chunk);
  }
  return validateSiteCatalog(JSON.parse(Buffer.concat(chunks).toString("utf8")));
}
