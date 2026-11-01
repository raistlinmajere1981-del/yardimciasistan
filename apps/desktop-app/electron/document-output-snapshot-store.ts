import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { DocumentFormImages } from "./document-form-images";
import { BUSINESS_CAPABILITIES, documentKindEnabled, type BusinessCapability, type DocumentFieldBinding, type DocumentKind, type DocumentTemplateLayout } from "@yardimci-asistan/shared";
import { createDocumentRenderSnapshot, type DocumentRenderSnapshot } from "./document-output-render-snapshot";

type Values = Partial<Record<DocumentFieldBinding, string | null>>;
/** Internal trusted owner only: caller must derive scope from its unlocked local session,
 * never from renderer input. No IPC or source acquisition is provided by this module. */
export interface DocumentSnapshotScope { businessId: string; installationId: string; jobId: string }
type Job = { document_kind: DocumentKind; channel: string; layout_snapshot_json: string };

function authorizedJob(db: DatabaseSync, scope: DocumentSnapshotScope): Job {
  const job = db.prepare("SELECT document_kind,channel,layout_snapshot_json FROM document_output_jobs WHERE business_id=? AND installation_id=? AND id=? AND legal_meaning='non_fiscal_copy'")
    .get(scope.businessId, scope.installationId, scope.jobId) as Job | undefined;
  if (!job) throw new Error("DOCUMENT_SNAPSHOT_UNAVAILABLE");
  const capabilities = db.prepare("SELECT capability_id FROM business_capabilities WHERE business_id=? AND is_enabled=1").all(scope.businessId) as { capability_id: BusinessCapability }[];
  const enabled = new Set(capabilities.map(row => row.capability_id));
  if (!documentKindEnabled(job.document_kind, enabled) || (job.channel === "whatsapp" && !enabled.has(BUSINESS_CAPABILITIES.WHATSAPP))) throw new Error("DOCUMENT_SNAPSHOT_UNAVAILABLE");
  return job;
}

function layoutFor(job: Job): DocumentTemplateLayout {
  if (typeof job.layout_snapshot_json !== "string" || Buffer.byteLength(job.layout_snapshot_json, "utf8") > 32768) throw new Error("DOCUMENT_SNAPSHOT_INVALID");
  return JSON.parse(job.layout_snapshot_json) as DocumentTemplateLayout;
}

/** Recreate the only valid representation from the frozen layout and literal texts.
 * This also rejects malformed, tampered or non-canonical persisted payloads. */
function validateStored(job: Job, json: string): DocumentRenderSnapshot {
  try {
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > 262144) throw new Error();
    const candidate = JSON.parse(json) as DocumentRenderSnapshot;
    if (!candidate || !Array.isArray(candidate.fields) || !Array.isArray(candidate.rows)) throw new Error();
    const values: Values = {};
    const lines: Values[] = [];
    const collect = (field: { binding: DocumentFieldBinding; text: string }, line?: Values) => {
      if (!field || typeof field.binding !== "string" || typeof field.text !== "string") throw new Error();
      const target = field.binding.startsWith("line.") ? line : values;
      if (!target || (Object.hasOwn(target, field.binding) && target[field.binding] !== field.text)) throw new Error();
      target[field.binding] = field.text;
    };
    for (const field of candidate.fields) collect(field);
    for (const row of candidate.rows) {
      if (!Array.isArray(row)) throw new Error();
      const line: Values = {};
      for (const field of row) collect(field, line);
      lines.push(line);
    }
    const rebuilt = createDocumentRenderSnapshot(job.document_kind, layoutFor(job), values, lines);
    if (JSON.stringify(rebuilt) !== json) throw new Error();
    return rebuilt;
  } catch { throw new Error("DOCUMENT_SNAPSHOT_INVALID"); }
}

/** Capture supplied operation-time values under a write lock. Identical retries only. */
export function captureDocumentRenderSnapshot(db: DatabaseSync, scope: DocumentSnapshotScope, values: Values, lines: Values[]): DocumentRenderSnapshot {
  db.exec("SAVEPOINT document_render_capture");
  try {
    const job = authorizedJob(db, scope);
    const snapshot = createDocumentRenderSnapshot(job.document_kind, layoutFor(job), values, lines);
    const json = JSON.stringify(snapshot);
    const prior = db.prepare("SELECT payload_json FROM document_output_render_snapshots WHERE business_id=? AND installation_id=? AND job_id=?").get(scope.businessId, scope.installationId, scope.jobId) as { payload_json: string } | undefined;
    if (prior) {
      validateStored(job, prior.payload_json);
      if (prior.payload_json !== json) throw new Error("DOCUMENT_SNAPSHOT_CONFLICT");
    } else {
      db.prepare("INSERT INTO document_output_render_snapshots (business_id,installation_id,job_id,payload_json) VALUES (?,?,?,?)").run(scope.businessId, scope.installationId, scope.jobId, json);
    }
    db.exec("RELEASE document_render_capture");
    return snapshot;
  } catch (error) { db.exec("ROLLBACK TO document_render_capture; RELEASE document_render_capture"); throw error; }
}

/** Null means an existing P0 job has no captured snapshot, not an empty document. */
export function readDocumentRenderSnapshot(db: DatabaseSync, scope: DocumentSnapshotScope): DocumentRenderSnapshot | null {
  db.exec("BEGIN");
  try {
    const job = authorizedJob(db, scope);
    const row = db.prepare("SELECT payload_json FROM document_output_render_snapshots WHERE business_id=? AND installation_id=? AND job_id=?").get(scope.businessId, scope.installationId, scope.jobId) as { payload_json: string } | undefined;
    const result = row ? validateStored(job, row.payload_json) : null;
    db.exec("COMMIT");
    return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

type ImageRole = "original" | "processed";
type ImageRow = { role: ImageRole; image_ref: string; sha256: string; bytes: Uint8Array };
export type DocumentSnapshotImage = { role: ImageRole; imageRef: string; bytes: Buffer };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function expectedImages(snapshot: DocumentRenderSnapshot): { role: ImageRole; ref: string }[] {
  if (!snapshot.scan) return [];
  const result: { role: ImageRole; ref: string }[] = [{ role: "original", ref: snapshot.scan.originalImageRef }];
  if (snapshot.scan.processedImageRef) result.push({ role: "processed", ref: snapshot.scan.processedImageRef });
  return result;
}
function imageContext(db: DatabaseSync, scope: DocumentSnapshotScope) {
  const job = authorizedJob(db, scope);
  const row = db.prepare("SELECT payload_json FROM document_output_render_snapshots WHERE business_id=? AND installation_id=? AND job_id=?").get(scope.businessId, scope.installationId, scope.jobId) as { payload_json: string } | undefined;
  if (!row) throw new Error("DOCUMENT_SNAPSHOT_UNAVAILABLE");
  return { job, expected: expectedImages(validateStored(job, row.payload_json)) };
}
function storedImages(db: DatabaseSync, scope: DocumentSnapshotScope, expected: { role: ImageRole; ref: string }[]): DocumentSnapshotImage[] {
  const rows = db.prepare("SELECT role,image_ref,sha256,bytes FROM document_output_snapshot_images WHERE business_id=? AND installation_id=? AND job_id=? ORDER BY role").all(scope.businessId, scope.installationId, scope.jobId) as ImageRow[];
  if (rows.length !== expected.length) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
  return expected.map(({ role, ref }) => {
    const row = rows.find(item => item.role === role);
    if (!row || row.image_ref !== ref || !(row.bytes instanceof Uint8Array)) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
    const bytes = Buffer.from(row.bytes);
    if (bytes.length < 33 || bytes.length > 12 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR" || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 25_000_000 || hash(bytes) !== row.sha256) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_INVALID");
    return { role, imageRef: ref, bytes };
  });
}
/** Caller supplies a trusted local image owner, not paths or renderer data. */
export function captureDocumentSnapshotImages(db: DatabaseSync, scope: DocumentSnapshotScope, images: DocumentFormImages): DocumentSnapshotImage[] {
  db.exec("SAVEPOINT document_image_capture");
  try {
    const { job, expected } = imageContext(db, scope);
    const existing = db.prepare("SELECT count(*) AS count FROM document_output_snapshot_images WHERE business_id=? AND installation_id=? AND job_id=?").get(scope.businessId, scope.installationId, scope.jobId) as { count: number };
    const prior = existing.count ? storedImages(db, scope, expected) : null;
    const captured = expected.map(({ role, ref }) => ({ role, imageRef: ref, bytes: images.readBytes(ref, scope.businessId, job.document_kind) }));
    if (prior) {
      if (prior.some((item, index) => !captured[index] || !item.bytes.equals(captured[index].bytes))) throw new Error("DOCUMENT_SNAPSHOT_IMAGES_CONFLICT");
    } else {
      const insert = db.prepare("INSERT INTO document_output_snapshot_images (business_id,installation_id,job_id,role,image_ref,sha256,bytes) VALUES (?,?,?,?,?,?,?)");
      for (const image of captured) insert.run(scope.businessId, scope.installationId, scope.jobId, image.role, image.imageRef, hash(image.bytes), image.bytes);
    }
    const result = storedImages(db, scope, expected);
    db.exec("RELEASE document_image_capture");
    return result;
  } catch (error) { db.exec("ROLLBACK TO document_image_capture; RELEASE document_image_capture"); throw error; }
}
/** Reads only frozen bytes; missing, partial and corrupted sets fail closed. */
export function readDocumentSnapshotImages(db: DatabaseSync, scope: DocumentSnapshotScope): DocumentSnapshotImage[] {
  db.exec("BEGIN");
  try {
    const { expected } = imageContext(db, scope);
    const result = storedImages(db, scope, expected);
    db.exec("COMMIT");
    return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
