import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { RequestDocument } from "@yardimci-asistan/shared";
import type { SyncTransport, SyncedCustomerRequest } from "@yardimci-asistan/sync-core";

export function requestDocumentPath(root: string, doc: RequestDocument): string {
  const extension = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }[doc.mime];
  if (!/^[a-f0-9]{32}$/.test(doc.id) || !extension || !/^[a-f0-9]{64}$/.test(doc.sha256)
      || !Number.isSafeInteger(doc.size) || doc.size < 1 || doc.size > 10 * 1024 * 1024) throw new Error("Belge bilgileri geçersiz.");
  return join(root, "assets", "request-documents", `${doc.id}.${extension}`);
}
function matches(bytes: Uint8Array, doc: RequestDocument) {
  return bytes.length === doc.size && createHash("sha256").update(bytes).digest("hex") === doc.sha256;
}
/** Files are durable before request cursor/ACK. Retry reuses the immutable identity. */
export async function cacheRequestDocuments(root: string, requests: SyncedCustomerRequest[], transport: SyncTransport) {
  for (const request of requests) {
    if ((request.documents?.length ?? 0) > 5) throw new Error("Başvuruda çok fazla belge var.");
    for (const doc of request.documents ?? []) {
      if (request.request_type !== "dealer_application") throw new Error("Beklenmeyen talep belgesi.");
      const path = requestDocumentPath(root, doc);
      const current = await readFile(path).catch(() => null);
      if (current && matches(current, doc)) continue;
      if (!transport.downloadRequestDocument) throw new Error("Web modülü belge aktarımını desteklemiyor.");
      const bytes = await transport.downloadRequestDocument(request.id, doc.id);
      if (!matches(bytes, doc)) throw new Error("Başvuru belgesi doğrulanamadı.");
      await mkdir(join(root, "assets", "request-documents"), { recursive: true, mode: 0o700 });
      const temporary = `${path}.pending`;
      try { await writeFile(temporary, bytes, { mode: 0o600 }); await rename(temporary, path); }
      finally { await unlink(temporary).catch(() => undefined); }
    }
  }
}
