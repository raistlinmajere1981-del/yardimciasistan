import type { DatabaseSync } from "node:sqlite";
import { readDocumentRenderSnapshot, readDocumentSnapshotImages, type DocumentSnapshotScope } from "./document-output-snapshot-store";

/** Internal primitive, not an IPC endpoint or a print adapter. The trusted caller must
 * obtain explicit confirmation and recheck the unlocked owner and local identities.
 * A successful claim is irreversible; never retry it after an uncertain outcome. */
export function claimConfirmedManualPrint(
  db: DatabaseSync, scope: DocumentSnapshotScope,
  authority: { assertConfirmedAndAuthorized(): void; availableDeviceNames: readonly string[] }
): { deviceName: string; copies: number } | null {
  authority.assertConfirmedAndAuthorized();
  if (!readDocumentRenderSnapshot(db, scope)) throw new Error("DOCUMENT_SNAPSHOT_UNAVAILABLE");
  readDocumentSnapshotImages(db, scope);
  db.exec("BEGIN IMMEDIATE");
  try {
    authority.assertConfirmedAndAuthorized();
    const job = db.prepare(`SELECT j.state,j.copies,b.printer_ref FROM document_output_jobs j
      JOIN document_printer_bindings b ON b.business_id=j.business_id AND b.installation_id=j.installation_id AND b.id=j.printer_binding_id
      WHERE j.business_id=? AND j.installation_id=? AND j.id=? AND j.legal_meaning='non_fiscal_copy'
        AND j.command_kind='manual' AND j.trigger_kind='manual' AND j.channel='print'
        AND j.mode='ASK_CONFIRMATION' AND j.adapter='native_print'`).get(scope.businessId, scope.installationId, scope.jobId) as { state: string; copies: number; printer_ref: string } | undefined;
    if (!job) throw new Error("DOCUMENT_PRINT_UNAVAILABLE");
    if (job.state !== "awaiting-confirmation") { db.exec("COMMIT"); return null; }
    const name = job.printer_ref;
    if (typeof name !== "string" || !name.trim() || name.length > 256 || Buffer.byteLength(name, "utf8") > 256 || /[\u0000-\u001f\u007f]/.test(name) || !authority.availableDeviceNames.includes(name)) throw new Error("DOCUMENT_PRINTER_INVALID");
    const update = db.prepare("UPDATE document_output_jobs SET state=? WHERE business_id=? AND installation_id=? AND id=? AND state=?");
    if (update.run("queued", scope.businessId, scope.installationId, scope.jobId, "awaiting-confirmation").changes !== 1 ||
        update.run("sending", scope.businessId, scope.installationId, scope.jobId, "queued").changes !== 1) throw new Error("DOCUMENT_CLAIM_CONFLICT");
    db.exec("COMMIT");
    return { deviceName: name, copies: job.copies };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

/** Completion evidence only; also usable to record uncertainty after a crash.
 * It does not requeue or grant permission to spool. */
export function finishManualPrintClaim(db: DatabaseSync, scope: DocumentSnapshotScope, result: "accepted" | "failed" | "unknown"): boolean {
  if (!["accepted", "failed", "unknown"].includes(result)) throw new Error("DOCUMENT_RESULT_INVALID");
  return db.prepare(`UPDATE document_output_jobs SET state=? WHERE business_id=? AND installation_id=? AND id=?
    AND state='sending' AND command_kind='manual' AND trigger_kind='manual' AND channel='print' AND mode='ASK_CONFIRMATION' AND adapter='native_print'`)
    .run(result, scope.businessId, scope.installationId, scope.jobId).changes === 1;
}
