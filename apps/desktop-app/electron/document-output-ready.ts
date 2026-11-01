import type { DatabaseSync } from "node:sqlite";
import type { DocumentKind } from "@yardimci-asistan/shared";
import { readDocumentRenderSnapshot, readDocumentSnapshotImages } from "./document-output-snapshot-store";

/** Only already-frozen manual jobs; never creates or repairs snapshots. */
export function listReadyDocuments(db: DatabaseSync, businessId: string, installationId: string, documentKind: DocumentKind): { jobId: string; createdAt: string }[] {
  const rows = db.prepare(`SELECT id,created_at FROM document_output_jobs WHERE business_id=? AND installation_id=? AND document_kind=?
    AND legal_meaning='non_fiscal_copy' AND command_kind='manual' AND trigger_kind='manual' AND channel='print'
    AND mode='ASK_CONFIRMATION' AND adapter='native_print' AND state='awaiting-confirmation' ORDER BY created_at DESC,id DESC LIMIT 100`)
    .all(businessId, installationId, documentKind) as { id: string; created_at: string }[];
  return rows.flatMap(row => {
    if (!/^[a-f0-9]{64}$/.test(row.id)) return [];
    const scope = { businessId, installationId, jobId: row.id };
    try {
      if (!readDocumentRenderSnapshot(db, scope)) return [];
      readDocumentSnapshotImages(db, scope);
      return [{ jobId: row.id, createdAt: row.created_at }];
    } catch { return []; }
  });
}
