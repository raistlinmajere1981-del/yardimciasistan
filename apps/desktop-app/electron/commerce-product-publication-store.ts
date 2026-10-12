import type { DatabaseSync } from "node:sqlite";
import type { CommerceProductPublication, SaveCommerceProductPublicationInput } from "@yardimci-asistan/shared";

function activeBusinessId(db: DatabaseSync): string {
  const row = db.prepare("SELECT id FROM business WHERE deleted_at = '' ORDER BY created_at ASC LIMIT 1").get();
  if (!row?.id) throw new Error("Aktif işletme bulunamadı.");
  return String(row.id);
}

function mapPublication(row: Record<string, unknown>): CommerceProductPublication {
  return {
    productId: String(row.product_id), businessId: String(row.business_id), channel: "online_sales",
    isPublished: Number(row.is_published) === 1,
    titleOverride: String(row.title_override), descriptionOverride: String(row.description_override),
    sortOrder: Number(row.sort_order), createdAt: String(row.created_at), updatedAt: String(row.updated_at)
  };
}

export function listCommerceProductPublications(db: DatabaseSync): CommerceProductPublication[] {
  return db.prepare("SELECT * FROM commerce_product_publications WHERE business_id = ? AND channel = 'online_sales' ORDER BY sort_order, product_id")
    .all(activeBusinessId(db)).map(mapPublication);
}

export function getCommerceProductPublication(db: DatabaseSync, productId: string): CommerceProductPublication | null {
  const row = db.prepare("SELECT * FROM commerce_product_publications WHERE business_id = ? AND product_id = ? AND channel = 'online_sales'")
    .get(activeBusinessId(db), String(productId ?? "").trim());
  return row ? mapPublication(row) : null;
}

export function saveCommerceProductPublication(db: DatabaseSync, input: SaveCommerceProductPublicationInput): CommerceProductPublication {
  const businessId = activeBusinessId(db);
  const productId = typeof input.productId === "string" ? input.productId.trim() : "";
  if (!productId || (input.channel !== undefined && input.channel !== "online_sales") || typeof input.isPublished !== "boolean") {
    throw new Error("Ürün yayın bilgisi geçersiz.");
  }
  if (!db.prepare("SELECT 1 FROM catalog_products WHERE id = ? AND business_id = ? AND deleted_at = ''").get(productId, businessId)) {
    throw new Error("Yayınlanacak ürün bulunamadı.");
  }
  const existing = getCommerceProductPublication(db, productId);
  const title = input.titleOverride === undefined ? existing?.titleOverride ?? "" : String(input.titleOverride).trim();
  const description = input.descriptionOverride === undefined ? existing?.descriptionOverride ?? "" : String(input.descriptionOverride).trim();
  const sortOrder = input.sortOrder ?? existing?.sortOrder ?? 0;
  if (title.length > 180 || description.length > 2000 || !Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    throw new Error("Ürün yayın alanları geçersiz.");
  }
  if (existing && existing.isPublished === input.isPublished && existing.titleOverride === title
      && existing.descriptionOverride === description && existing.sortOrder === sortOrder) return existing;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO commerce_product_publications (product_id, business_id, channel, is_published,
      title_override, description_override, sort_order, created_at, updated_at)
    VALUES (?, ?, 'online_sales', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, channel) DO UPDATE SET is_published = excluded.is_published,
      title_override = excluded.title_override, description_override = excluded.description_override,
      sort_order = excluded.sort_order, updated_at = excluded.updated_at
  `).run(productId, businessId, input.isPublished ? 1 : 0, title, description, sortOrder, now, now);
  return getCommerceProductPublication(db, productId)!;
}

export function deleteCommerceProductPublication(db: DatabaseSync, productId: string): void {
  db.prepare("DELETE FROM commerce_product_publications WHERE business_id = ? AND product_id = ? AND channel = 'online_sales'")
    .run(activeBusinessId(db), String(productId ?? "").trim());
}

/** Publication intent count and durable pending state, never a second acknowledgement. */
export function readOnlineCatalogOperations(db: DatabaseSync) {
  const row = db.prepare(`SELECT COUNT(*) AS count,COALESCE(MAX(p.updated_at),'') AS updated_at
    FROM commerce_product_publications p JOIN catalog_products c ON c.id=p.product_id AND c.business_id=p.business_id
    WHERE p.business_id=? AND p.channel='online_sales' AND p.is_published=1 AND c.is_active=1 AND c.deleted_at=''`)
    .get(activeBusinessId(db));
  return { desired_product_count: Number(row?.count ?? 0),
    pending: Boolean(db.prepare("SELECT 1 FROM sync_outbox WHERE job_type='online_catalog_publish'").get()),
    updated_at: String(row?.updated_at ?? "") };
}
