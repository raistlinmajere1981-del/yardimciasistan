import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { setImmediate as yieldImmediate } from "node:timers/promises";
import { BUSINESS_CAPABILITIES as C, normalizeBarcodeIdentity, normalizePhone } from "@yardimci-asistan/shared";
import { readEnabledBusinessCapabilities } from "./business-capability-store";
import { saveCatalogProductInTransaction, setInventoryCountInTransaction, type CatalogProductImageMutation, type SaveCatalogProductInput } from "./commerce-store";
import { saveCatalogCategoryInTransaction } from "./commerce-category-store";
import { saveCommerceProductPublication } from "./commerce-product-publication-store";
import { saveCustomer, getCustomers } from "./database/customer-store";
import { saveMenuCategory } from "./database/menu-store";
import { saveMenuProductEntryInTransaction } from "./database/menu-product-entry-store";
import type { SaveCustomerInput } from "./database-types";
import { normalizeCustomerInput } from "./database/customer-utils";
import { PRODUCT_TRANSFER_FIELDS, CUSTOMER_TRANSFER_FIELDS, IDENTITY_TRANSFER_FIELDS, type TransferEntity, type TransferPreferences, type TransferPreview, type TransferResult, type TransferRow, type TransferExportOptions, type TransferProgress } from "./data-transfer-contract";
import { encodeTransferFile, imageMime, transferBoolean, transferHash, transferNumber, type TransferAsset, type TransferDocument, type TransferRecord } from "./data-transfer-format";
import { readProductImageAsset } from "./product-image-reader";

interface PreparedRow { identity: TransferRecord; baseline: string; view: TransferRow; product?: SaveCatalogProductInput; customer?: SaveCustomerInput; image?: Uint8Array | undefined; originals?: Uint8Array[]; categoryPath?: string; menu?: TransferRecord; stock?: number | undefined; existingId: string; newId: string }
export interface TransferPlan { entity: TransferEntity; preferences: TransferPreferences; document: TransferDocument; mapping: Record<string, string>; preview: TransferPreview; rows: PreparedRow[]; fingerprint: string }
export interface TransferImageOwner {
  validate(bytes: Uint8Array): void;
  prepare(databasePath: string, productId: string, bytes: Uint8Array, originals?: Uint8Array[]): Promise<CatalogProductImageMutation>;
  remote?(url: string): Promise<Uint8Array>;
}
function openTransferDatabase(databasePath: string) { const db = new DatabaseSync(databasePath); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000"); return db; }
function business(db: DatabaseSync): string {
  const id = String(db.prepare("SELECT id FROM business WHERE deleted_at='' ORDER BY created_at LIMIT 1").get()?.id ?? "");
  if (!id) throw new Error("Aktif işletme bulunamadı."); return id;
}
function assertAccess(db: DatabaseSync, entity: TransferEntity, preferences?: TransferPreferences) {
  const caps = new Set(readEnabledBusinessCapabilities(db));
  const require = (capability: typeof C[keyof typeof C]) => { if (!caps.has(capability)) throw new Error("Bu aktarım işlemi için gerekli özellik etkin değil."); };
  require(entity === "customers" ? C.CUSTOMERS : C.CATALOG);
  if (preferences?.publish) require(C.ONLINE_SALES);
  if (preferences?.menuCategoryId) require(C.FOOD_MENU);
  if (preferences?.applyStock) require(C.INVENTORY);
  return caps;
}
function fingerprint(db: DatabaseSync) {
  const tables = ["business", "business_capabilities", "catalog_products", "catalog_categories", "commerce_product_publications", "customers", "customer_commercial_profiles", "menu_categories", "menu_product_entries", "inventory_balances"];
  return transferHash(JSON.stringify(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())));
}
function stringifyRecord(record: Record<string, unknown>): TransferRecord { return Object.fromEntries(Object.entries(record).map(([k,v]) => [k, v == null ? "" : String(v)])); }
function splitTags(s: string) { return s ? s.split("|").map(t=>t.trim()).filter(Boolean) : []; }
function category(db: DatabaseSync, path: string) {
  let parentId = "";
  for (const name of path.split(" > ").map(s=>s.trim()).filter(Boolean)) {
    const existing = db.prepare("SELECT id FROM catalog_categories WHERE business_id=? AND parent_id=? AND name=? AND deleted_at=''").get(business(db), parentId, name);
    // Imported category names are usable immediately in local sales and category pickers.
    // This does not activate or publish imported products, and existing disabled
    // categories retain the operator's explicit visibility choice.
    parentId = existing ? String(existing.id) : saveCatalogCategoryInTransaction(db, { name, parentId, isActive: true }).id;
  }
  return parentId;
}
function matchProduct(db: DatabaseSync, values: TransferRecord) {
  const clauses: string[] = [], args: string[] = [business(db)];
  if (values.id) { clauses.push("id=?"); args.push(values.id); }
  if (values.sku) { clauses.push("sku=?"); args.push(values.sku); }
  if (values.barcode) { clauses.push("barcode=?"); args.push(normalizeBarcodeIdentity(values.barcode,80)); }
  if (values.sourceId || values.sourceProductUrl) { clauses.push("(data_source='data-transfer' AND source_product_url=?)"); args.push(values.sourceProductUrl || `urn:transfer:${values.sourceId}`); }
  // A stable content key permits repeated imports with no SKU, barcode or external ID, without name-only merging.
  if (!clauses.length) { clauses.push("(data_source='data-transfer' AND source_product_url=?)"); args.push(`urn:transfer:content:${transferHash(JSON.stringify(values))}`); }
  const matches = db.prepare(`SELECT * FROM catalog_products WHERE business_id=? AND deleted_at='' AND (${clauses.join(" OR ")})`).all(...args);
  if (matches.length > 1) throw new Error("Kimlik, stok kodu veya barkod farklı kayıtlarla eşleşiyor; eşlemeyi düzeltin.");
  return matches[0];
}
function matchCustomer(db: DatabaseSync, values: TransferRecord) {
  const normalized = normalizePhone(values.phone ?? "");
  const clauses: string[] = [], args: string[] = [business(db)];
  if (values.id) { clauses.push("c.id=?"); args.push(values.id); }
  if (normalized.ok && values.phone) { clauses.push("c.phone=?"); args.push(normalized.e164); }
  if (values.taxNumber) { clauses.push("p.tax_number=?"); args.push(values.taxNumber.replace(/\s/g,"")); }
  const stable = `customer_transfer_${transferHash(JSON.stringify(values)).slice(0,32)}`;
  clauses.push("c.id=?"); args.push(stable);
  const matches = db.prepare(`SELECT c.* FROM customers c LEFT JOIN customer_commercial_profiles p ON p.customer_id=c.id WHERE c.business_id=? AND c.deleted_at='' AND (${clauses.join(" OR ")})`).all(...args);
  if (matches.length > 1) throw new Error("Kimlik, telefon veya vergi numarası farklı müşterilerle eşleşiyor.");
  return { existing: matches[0], stable };
}
function applyRow(db: DatabaseSync, plan: Pick<TransferPlan,"entity"|"preferences">, row: PreparedRow, image?: CatalogProductImageMutation) {
  const p = plan.preferences, now = new Date().toISOString();
  if (row.product) {
    const input = { ...row.product, categoryId: row.categoryPath ? category(db, row.categoryPath) : row.product.categoryId ?? "" };
    const saved = saveCatalogProductInTransaction(db, input, now, image ?? (row.existingId ? undefined : { productId: row.newId, assetPath: "", sourceUrl: input.imageSourceUrl ?? "", license: "" }));
    if (p.publish && row.view.publishable) saveCommerceProductPublication(db, { productId: saved.id, isPublished: true });
    if (p.applyStock && row.stock !== undefined) setInventoryCountInTransaction(db, { productId: saved.id, countedQuantity: row.stock, referenceType: "data_transfer", referenceId: row.newId, actorSource: "desktop" }, now);
    if (p.menuCategoryId && (p.menuCategoryId !== "__source__" || row.menu?.menuCategory)) {
      const old = db.prepare("SELECT * FROM menu_product_entries WHERE product_id=? AND deleted_at=''").get(saved.id);
      const m = row.menu ?? {};
      let menuCategoryId=p.menuCategoryId;
      if(menuCategoryId === "__source__") {
        const existingCategory=db.prepare("SELECT id FROM menu_categories WHERE name=? AND deleted_at=''").get(m.menuCategory!);
        if(existingCategory) menuCategoryId=String(existingCategory.id);
        else {const created=saveMenuCategory(db,{name:m.menuCategory!,description:"",is_active:false,sort_order:0});if(!created.ok)throw new Error(created.message);menuCategoryId=created.savedId;}
      }
      const result = saveMenuProductEntryInTransaction(db, {
        ...(old ? { id: String(old.id) } : {}), product_id: saved.id, category_id: menuCategoryId,
        price_override: m.menuPriceOverride === undefined ? old?.price_override == null ? null : Number(old.price_override) : transferNumber(m.menuPriceOverride) ?? null,
        allergens: m.allergens === undefined ? JSON.parse(String(old?.allergens_json ?? "[]")) as string[] : splitTags(m.allergens), tags: m.tags === undefined ? JSON.parse(String(old?.tags_json ?? "[]")) as string[] : splitTags(m.tags),
        is_available: transferBoolean(m.menuAvailable ?? "") ?? Number(old?.is_available ?? 0) === 1, is_featured: transferBoolean(m.menuFeatured ?? "") ?? Number(old?.is_featured ?? 0) === 1,
        hide_when_out_of_stock: transferBoolean(m.menuHideOutOfStock ?? "") ?? Number(old?.hide_when_out_of_stock ?? 0) === 1,
        stock_consumption_quantity: transferNumber(m.menuConsumption ?? "") ?? Number(old?.stock_consumption_quantity ?? 1), sort_order: transferNumber(m.menuSortOrder ?? "") ?? Number(old?.sort_order ?? 0)
      }, now);
      if (!result.ok) throw new Error(result.message);
    }
  } else if (row.customer) {
    const result = saveCustomer(db, row.customer, { newCustomerId: row.newId });
    if (!result.ok) throw new Error(result.message);
  }
}
/** Resolve external images once before preview, so apply uses the reviewed bytes. */
export async function resolveTransferImages(document: TransferDocument, mapping: Record<string,string>, images: TransferImageOwner, assertCurrent:()=>void, progress:(p:TransferProgress)=>void) {
  if (!images.remote) return;
  const urls = [...new Set(document.records.map(record=>record[mapping.image ?? ""] || record[mapping.imageSourceUrl ?? ""] || "").filter(url=>/^https:\/\//i.test(url)))];
  let totalBytes=Object.values(document.assets).reduce((sum,bytes)=>sum+bytes.length,0);
  for (const [index,url] of urls.entries()) {
    assertCurrent(); progress({stage:"Görseller doğrulanıyor",done:index,total:urls.length});
    if(document.assets[url])continue;
    if(index>=100 || totalBytes>=100*1024*1024) { document.warnings.push("Uzak görsel sayısı/boyut sınırı nedeniyle bazı görseller indirilemedi.");break; }
    try { const bytes=await images.remote(url);assertCurrent();images.validate(bytes);document.assets[url]=bytes;totalBytes+=bytes.length; }
    catch { /* Per-row missing-image policy and warnings remain authoritative. */ }
  }
}
export function createTransferPlan(databasePath: string, entity: TransferEntity, document: TransferDocument, mapping: Record<string,string>, preferences: TransferPreferences, images: TransferImageOwner): TransferPlan {
  if (!["skip","update"].includes(preferences.conflicts) || !["without","skip"].includes(preferences.missingImages) || [preferences.activate,preferences.publish,preferences.applyStock,preferences.fallbackCategory].some(v=>typeof v !== "boolean")) throw new Error("Aktarım tercihleri geçersiz.");
  const fields = entity === "products" ? PRODUCT_TRANSFER_FIELDS : CUSTOMER_TRANSFER_FIELDS;
  for (const [field, header] of Object.entries(mapping)) if (!fields[field] || !document.headers.includes(header)) throw new Error("Kolon eşlemesi geçersiz.");
  if (new Set(Object.values(mapping)).size !== Object.values(mapping).length) throw new Error("Bir kolon iki alana eşlenemez.");
  const db = openTransferDatabase(databasePath);
  try {
    const caps = assertAccess(db, entity, preferences);
    if (preferences.menuCategoryId && preferences.menuCategoryId !== "__source__" && !db.prepare("SELECT id FROM menu_categories WHERE id=? AND deleted_at=''").get(preferences.menuCategoryId)) throw new Error("Menü kategorisi bulunamadı.");
    const baseline = fingerprint(db), rows: PreparedRow[] = [];
    const plan: TransferPlan = { entity, preferences, document, mapping, fingerprint: baseline, rows, preview: { revision: randomUUID(), total: document.records.length, counts: {new:0,update:0,skip:0,error:0}, publishable:0, blocked:0, existingPublished:0, rows:[] } };
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [index, record] of document.records.entries()) {
        const values: TransferRecord = Object.fromEntries(Object.entries(mapping).map(([field,header])=>[field,record[header] ?? ""]));
        const stableContentKey = transferHash(JSON.stringify(values));
        const row: PreparedRow = { identity:{...values}, baseline:"", existingId: "", newId: "", view: { row:index+2, name:values.name || values.fullName || `Satır ${index+2}`, status:"new", reasons:[], warnings:[], before:{}, after:values, publishable:false } };
        rows.push(row); db.exec("SAVEPOINT transfer_row");
        try {
          if (entity === "products") {
            const old = matchProduct(db,values); row.existingId = String(old?.id ?? ""); row.baseline=old?String(old.updated_at):""; row.newId = row.existingId || `product_${randomUUID()}`;
            row.view.status = old ? preferences.conflicts === "skip" ? "skip" : "update" : "new";
            row.view.before = old ? stringifyRecord({id:old.id,name:old.name,category:db.prepare("SELECT name FROM catalog_categories WHERE id=?").get(String(old.category_id))?.name,brand:old.brand,sku:old.sku,barcode:old.barcode,description:old.description,salePrice:old.sale_price,purchasePrice:old.purchase_price,dealerPriceA:old.dealer_price_a,dealerPriceB:old.dealer_price_b,currency:old.currency,unit:old.unit,taxRate:old.tax_rate,trackInventory:Number(old.track_inventory)===1,minimumQuantity:old.minimum_quantity,sourceProductUrl:old.source_product_url}) : {};
            if (row.view.status === "skip") row.view.reasons.push("Eşleşen kayıt korundu.");
            const numeric: Record<string,number|undefined> = {};
            for (const key of ["salePrice","purchasePrice","dealerPriceA","dealerPriceB","taxRate","minimumQuantity","stockQuantity"]) {
              numeric[key] = transferNumber(values[key] ?? "");
              if (numeric[key] !== undefined && (numeric[key] < 0 || (key === "taxRate" && numeric[key] > 100))) throw new Error(`${fields[key]} sınır dışında.`);
            }
            const tracking = transferBoolean(values.trackInventory ?? "");
            const sourcePublication=transferBoolean(values.onlineSalesPublished ?? "");
            const unknown = [numeric.taxRate === undefined ? "KDV oranı" : "", tracking === undefined ? "Stok takibi" : "", numeric.purchasePrice === undefined ? "Alış fiyatı" : ""].filter(Boolean);
            if (unknown.length) row.view.warnings.push(`${unknown.join(", ")}: doğrulama gerekiyor. Sayısal yer tutucular doğrulanmış veri değildir.`);
            if (!values.brand) row.view.warnings.push("Marka doğrulanmadı.");
            const blocking = [!(numeric.salePrice! > 0) ? "Pozitif brüt fiyat gerekli" : "", numeric.taxRate === undefined ? "KDV doğrulanmalı" : "", tracking === undefined ? "Stok takibi doğrulanmalı" : "", tracking && numeric.stockQuantity === undefined ? "Stok miktarı doğrulanmalı" : "", !values.unit ? "Birim doğrulanmalı" : "", !values.currency ? "Para birimi doğrulanmalı" : ""] .filter(Boolean);
            row.view.publishable = sourcePublication !== false && !blocking.length && (preferences.activate || Number(old?.is_active) === 1) && (!tracking || (preferences.applyStock && numeric.stockQuantity! > 0));
            if (preferences.publish && !row.view.publishable) row.view.warnings.push(`Yayın engelli: ${blocking.join(", ") || "aktiflik/stok sayımı gerekli"}.`);
            if (preferences.activate && (unknown.length || blocking.length)) throw new Error("Eksik fiyat/vergi/stok bilgisiyle etkinleştirilemez; taslak olarak alın.");
            const oldCategory = old?.category_id ? db.prepare("SELECT name FROM catalog_categories WHERE id=?").get(String(old.category_id)) : undefined;
            const categoryPath = values.categoryPath || values.category || (oldCategory ? String(oldCategory.name) : preferences.fallbackCategory ? "Diğer" : "");
            if (!categoryPath) throw new Error("Kategori eksik. Diğer'e yönlendirmeyi seçin.");
            if (!old || values.category !== undefined || values.categoryPath !== undefined) row.categoryPath = categoryPath;
            row.view.after = {...values, category:categoryPath};
            if (!values.category && !values.categoryPath) row.view.warnings.push("Kategori eksik: Diğer'e yönlendirilecek.");
            if (!preferences.menuCategoryId) row.view.warnings.push("Yalnız kataloğa kaydedilecek; restoran menüsüne eklenmeyecek.");
            const unitAliases: Record<string,string> = { adet:"piece", paket:"pack", kutu:"box", metre:"meter", litre:"l" };
            const unit = unitAliases[values.unit?.toLocaleLowerCase("tr-TR") ?? ""] || values.unit || String(old?.unit ?? "piece");
            if (!["piece","kg","g","l","ml","pack","box","meter","other"].includes(unit)) throw new Error("Birim tanınmadı; kolon değerini düzeltin.");
            if (values.currency && !/^[A-Z]{3}$/.test(values.currency)) throw new Error("Para birimi üç büyük harf olmalı.");
            row.stock = numeric.stockQuantity;
            if (preferences.applyStock && (tracking !== true || numeric.stockQuantity === undefined || numeric.taxRate === undefined || blocking.length>0)) throw new Error("Stok sayımı için stok takibi, miktar ve KDV açıkça doğrulanmalı.");
            if ((values.dealerPriceA || values.dealerPriceB) && !caps.has(C.WHOLESALE)) throw new Error("Bayi fiyatları için Toptan Satış etkin olmalı.");
            const source = values.sourceProductUrl || (values.sourceId ? `urn:transfer:${values.sourceId}` : `urn:transfer:content:${stableContentKey}`);
            row.product = {
              ...(old ? { id: row.existingId, categoryId:String(old.category_id ?? "") } : {}), name: values.name || String(old?.name ?? ""),
              brand: values.brand ?? String(old?.brand ?? ""), sku: values.sku ?? String(old?.sku ?? ""), barcode: values.barcode ?? String(old?.barcode ?? ""),
              description: values.description ?? String(old?.description ?? ""),
              salePrice: numeric.salePrice ?? Number(old?.sale_price ?? 0), purchasePrice: numeric.purchasePrice ?? Number(old?.purchase_price ?? 0),
              dealerPriceA: numeric.dealerPriceA ?? (old?.dealer_price_a == null ? null : Number(old.dealer_price_a)), dealerPriceB: numeric.dealerPriceB ?? (old?.dealer_price_b == null ? null : Number(old.dealer_price_b)),
              currency: values.currency || String(old?.currency ?? "TRY"), unit: unit as NonNullable<SaveCatalogProductInput["unit"]>, taxRate: numeric.taxRate ?? Number(old?.tax_rate ?? 0),
              trackInventory: tracking ?? (old ? Number(old.track_inventory) === 1 : false), minimumQuantity: numeric.minimumQuantity ?? Number(old?.minimum_quantity ?? 0),
              isActive: old ? Number(old.is_active) === 1 : preferences.activate, onlineSalesPublished: preferences.publish && row.view.publishable,
              dataSource: "data-transfer", sourceProductUrl: source, imageSourceUrl: values.imageSourceUrl || (/^https:\/\//.test(values.image ?? "") ? values.image! : String(old?.image_source_url ?? ""))
            };
            const existingPublished=old && db.prepare("SELECT is_published FROM commerce_product_publications WHERE product_id=? AND channel='online_sales'").get(row.existingId)?.is_published === 1;
            if(old && Number(old.is_active) === 1 && row.view.status === "update") {
              const next=row.product;
              if(!(next.salePrice!>0) || (next.trackInventory && tracking===undefined && String(old.description).includes("Stok takibi doğrulanmalı"))) throw new Error("Aktif ürün doğrulanmamış veya sıfır fiyatla güncellenemez; ürün kartında önce taslağa alın.");
              if(existingPublished) {
                if((numeric.taxRate===undefined && String(old.description).includes("KDV oranı")) || !(next.salePrice!>0)) throw new Error("Yayındaki ürünü eksik verilerle güncelleyemezsiniz; önce yayından kaldırın.");
                row.view.warnings.push("Mevcut web yayını korunacak; bu güncelleme yayındaki ürünü etkiler.");
              }
            }
            // Retain missing-field provenance in the canonical description. No invented tax/cost verification state.
            if (!old && unknown.length) row.product.description = `${row.product.description || ""}\n[Aktarım: ${unknown.join(", ")} doğrulanmalı.]`.trim();
            row.menu = values;
            if(preferences.menuCategoryId && (transferBoolean(values.menuHideOutOfStock ?? "") === true) && (!caps.has(C.INVENTORY) || !caps.has(C.QR_MENU))) throw new Error("Stokta yokken gizleme için Stok ve QR Menü etkin olmalı.");
            if(preferences.menuCategoryId && values.menuConsumption && transferNumber(values.menuConsumption)!==1 && !caps.has(C.INVENTORY)) throw new Error("Menü stok tüketimi için Stok etkin olmalı.");
            const imageKey=values.image || values.imageSourceUrl || "";
            if (imageKey && document.assets[imageKey]) { row.image = document.assets[imageKey]; images.validate(row.image);
              const linked = (document.assetManifest ?? []).filter(a=>(values.id && a.productId===values.id) || (values.sku && a.sku===values.sku));
              row.originals = [...new Set([imageKey,...linked.map(a=>a.path)])].map(path=>document.assets[path]!).filter(Boolean);
              row.originals = row.originals.filter((bytes,index,all)=>all.findIndex(other=>transferHash(other)===transferHash(bytes))===index);
              if (row.originals.length > 12) throw new Error("Ürün başına en fazla 12 fotoğraf aktarılabilir.");
              row.originals.forEach(bytes=>images.validate(bytes)); }
            else if (values.image || values.imageSourceUrl) {
              row.view.warnings.push("Görsel arşivde yok; yerel arşivden getirilemedi.");
              if (preferences.missingImages === "skip") { row.view.status = "skip"; row.view.reasons.push("Eksik görsel tercihi nedeniyle atlandı."); }
            }
          } else {
            const { existing:old, stable } = matchCustomer(db,values); row.existingId = String(old?.id ?? ""); row.baseline=old?String(old.updated_at):""; row.newId = row.existingId || stable;
            row.view.status = old ? preferences.conflicts === "skip" ? "skip" : "update" : "new";
            const previous = old ? getCustomers(db,{id:row.existingId,limit:1})[0] : undefined;
            row.view.before = previous ? stringifyRecord({
              ...previous,
              companyName: previous.commercialProfile?.companyName,
              taxOffice: previous.commercialProfile?.taxOffice,
              taxNumber: previous.commercialProfile?.taxNumber,
              authorizedPerson: previous.commercialProfile?.authorizedPerson,
              dealerStatus: previous.commercialProfile?.dealerStatus,
              priceGroup: previous.commercialProfile?.priceGroup,
              paymentTermDays: previous.commercialProfile?.paymentTermDays,
            }) : {};
            if (row.view.status === "skip") row.view.reasons.push("Eşleşen müşteri korundu.");
            const commercial = previous?.commercialProfile;
            if (["companyName","dealerStatus","priceGroup","taxNumber","taxOffice"].some(k=>Boolean(values[k])) && !caps.has(C.WHOLESALE)) throw new Error("Bayi profili için Toptan Satış etkin olmalı.");
            const input = { ...previous, ...(old ? {id:row.existingId} : {}), fullName:values.fullName || previous?.fullName || "", phone:values.phone ?? previous?.phone ?? "", email:values.email ?? previous?.email ?? "", address:values.address ?? previous?.address ?? "", notes:values.notes ?? previous?.notes ?? "", birthdayMessageEnabled: previous?.birthdayMessageEnabled ?? false } as SaveCustomerInput;
            if (!old) delete input.id;
            for (const key of IDENTITY_TRANSFER_FIELDS) if (values[key] !== undefined) Object.assign(input,{[key]:values[key]});
            if (values.companyName || commercial) input.commercialProfile = {
              companyName: values.companyName || commercial?.companyName || "", taxOffice:values.taxOffice ?? commercial?.taxOffice ?? "", taxNumber:values.taxNumber ?? commercial?.taxNumber ?? "",
              authorizedPerson:values.authorizedPerson ?? commercial?.authorizedPerson ?? "", dealerStatus:(values.dealerStatus || commercial?.dealerStatus || "inactive") as "active"|"inactive",
              priceGroup:(values.priceGroup || commercial?.priceGroup || "retail") as "retail"|"dealer_a"|"dealer_b", paymentTermDays:transferNumber(values.paymentTermDays ?? "") ?? commercial?.paymentTermDays ?? 0
            };
            else delete input.commercialProfile;
            const normalized = normalizeCustomerInput(input); if (!normalized.ok) throw new Error(normalized.message);
            row.customer = input;
          }
          if (row.view.status !== "skip") {
            applyRow(db,plan,row);
            if(entity === "products" && row.existingId && db.prepare("SELECT is_published FROM commerce_product_publications WHERE product_id=? AND channel='online_sales'").get(row.existingId)?.is_published===1) plan.preview.existingPublished++;
          }
          db.exec("RELEASE transfer_row");
        } catch (error) {
          db.exec("ROLLBACK TO transfer_row; RELEASE transfer_row"); row.view.status="error";
          row.view.reasons.push(error instanceof Error ? error.message : "Satır doğrulanamadı.");
        }
        plan.preview.counts[row.view.status]++;
        if (row.view.status === "new" || row.view.status === "update") { if (row.view.publishable) plan.preview.publishable++; else plan.preview.blocked++; }
      }
    } finally { db.exec("ROLLBACK"); }
    plan.preview.rows = rows.slice(0,50).map(r=>r.view);
    return plan;
  } finally { db.close(); }
}
export async function applyTransferPlan(databasePath: string, plan: TransferPlan, images: TransferImageOwner, assertCurrent: () => void, progress: (p:TransferProgress)=>void): Promise<TransferResult> {
  const db = openTransferDatabase(databasePath);
  const result: TransferResult = {added:0,updated:0,skipped:0,errors:0,rows:[]};
  try {
    assertCurrent(); assertAccess(db,plan.entity,plan.preferences);
    if (fingerprint(db) !== plan.fingerprint) throw new Error("Veriler önizlemeden sonra değişti. Yeniden analiz edin.");
    // Planned row commits keep the event loop responsive. Recheck session/capabilities and identities after each asynchronous image prepare.
    for (const [index,row] of plan.rows.entries()) {
      progress({stage:"Kayıtlar uygulanıyor",done:index,total:plan.rows.length});
      const view = { ...row.view, reasons:[...row.view.reasons], warnings:[...row.view.warnings] };
      if (view.status === "skip") result.skipped++;
      else if (view.status === "error") result.errors++;
      else {
        try {
          assertCurrent(); assertAccess(db,plan.entity,plan.preferences);
          const image = row.image ? await images.prepare(databasePath,row.newId,row.image,row.originals) : undefined;
          assertCurrent(); assertAccess(db,plan.entity,plan.preferences);
          db.exec("BEGIN IMMEDIATE");
          try {
            const current = row.product ? matchProduct(db, row.identity) : matchCustomer(db,row.identity).existing;
            if (String(current?.id ?? "") !== row.existingId || (row.existingId && String(current?.updated_at ?? "") !== row.baseline)) throw new Error("Satırın eşleşmesi değişti; yeniden analiz edin.");
            applyRow(db,plan,row,image); db.exec("COMMIT");
          } catch (error) { db.exec("ROLLBACK"); throw error; }
          if (view.status === "new") result.added++; else result.updated++;
        } catch (error) { view.status="error";view.reasons.push(error instanceof Error ? error.message : "Kayıt uygulanamadı.");result.errors++; }
      }
      result.rows.push(view);
      if (index % 20 === 0) await yieldImmediate();
    }
    progress({stage:"İşlem tamamlandı",done:plan.rows.length,total:plan.rows.length}); return result;
  } finally { db.close(); }
}
export function collectTransferExport(databasePath: string, options: TransferExportOptions) {
  const db = openTransferDatabase(databasePath);
  try {
    const caps = assertAccess(db,options.entity), businessId = business(db);
    if (options.template) {
      let headers = Object.keys(options.entity === "products" ? PRODUCT_TRANSFER_FIELDS : CUSTOMER_TRANSFER_FIELDS);
      if (!options.includeIdentity) headers = headers.filter(h=>!IDENTITY_TRANSFER_FIELDS.includes(h));
      if (options.template === "basic") headers = options.entity === "products" ? ["name","category","sku","barcode","salePrice","currency","unit","taxRate","trackInventory"] : ["fullName","phone","email","address","notes"];
      if (options.template === "ideasoft" && options.entity === "products") headers = ["Ürün Adı","Stok Kodu","Barkod","Kategori","Marka","Satış Fiyatı","KDV Oranı","Para Birimi","Birim","Stok Takibi","Görsel URL"];
      return { headers,records:[] as TransferRecord[],images:0 };
    }
    const records: TransferRecord[] = [];
    if (options.entity === "customers") {
      for (let offset=0;;offset+=200) {
        const customers = getCustomers(db,{limit:200,offset,...(options.scope === "filtered" ? {search:options.search ?? "",filter:options.customerFilter ?? "all"} : {})});
        for (const c of customers) {
          const record: TransferRecord = { id:c.id,fullName:c.fullName,phone:c.phone,email:c.email,address:c.address,notes:c.notes };
          if (caps.has(C.WHOLESALE) && c.commercialProfile) {
            const p = c.commercialProfile;
            Object.assign(record,{companyName:p.companyName,taxOffice:p.taxOffice,taxNumber:p.taxNumber,authorizedPerson:p.authorizedPerson,dealerStatus:p.dealerStatus,priceGroup:p.priceGroup,paymentTermDays:String(p.paymentTermDays)});
          }
          if (options.includeIdentity) for (const key of IDENTITY_TRANSFER_FIELDS) record[key] = String(c[key as keyof typeof c] ?? "");
          records.push(record);
        }
        if (customers.length < 200) break;
      }
    } else {
      db.function("transfer_search_text", { deterministic:true }, value=>String(value ?? "").toLocaleLowerCase("tr-TR"));
      const search = options.scope === "filtered" ? options.search?.trim().toLocaleLowerCase("tr-TR") ?? "" : "";
      const products = db.prepare(`SELECT p.*, c.name category, pub.is_published, (SELECT SUM(quantity) FROM inventory_balances WHERE product_id=p.id) stock_quantity,
        m.category_id menu_category_id, mc.name menu_category, m.price_override, m.allergens_json, m.tags_json, m.is_available, m.is_featured, m.hide_when_out_of_stock, m.stock_consumption_quantity, m.sort_order menu_sort_order
        FROM catalog_products p LEFT JOIN catalog_categories c ON c.id=p.category_id
        LEFT JOIN commerce_product_publications pub ON pub.product_id=p.id AND pub.channel='online_sales'
        LEFT JOIN menu_product_entries m ON m.product_id=p.id AND m.deleted_at=''
        LEFT JOIN menu_categories mc ON mc.id=m.category_id
        WHERE p.business_id=? AND p.deleted_at='' AND (?=0 OR p.quick_access_enabled=1) AND instr(transfer_search_text(p.name || ' ' || p.brand || ' ' || p.sku || ' ' || p.barcode),?)>0 ORDER BY p.id`).all(businessId,options.scope === "filtered" && options.quickAccessOnly ? 1 : 0,search);
      const categories = db.prepare("SELECT id,parent_id,name FROM catalog_categories WHERE business_id=? AND deleted_at=''").all(businessId);
      const paths = new Map(categories.map(c=>[String(c.id),c]));
      const categoryPath = (id:string) => { const names:string[] = [], seen=new Set<string>();let current=paths.get(id);while(current && !seen.has(String(current.id))){seen.add(String(current.id));names.unshift(String(current.name));current=paths.get(String(current.parent_id));}return names.join(" > "); };
      for (const p of products) {
        const record = stringifyRecord({ id:p.id,name:p.name,category:p.category,categoryPath:categoryPath(String(p.category_id)),brand:p.brand,sku:p.sku,barcode:p.barcode,description:p.description,
          salePrice:p.sale_price,purchasePrice:p.purchase_price,currency:p.currency,unit:p.unit,taxRate:p.tax_rate,trackInventory:Number(p.track_inventory)===1,minimumQuantity:p.minimum_quantity,stockQuantity:p.stock_quantity,
          sourceId:p.id,sourceProductUrl:p.source_product_url,imageSourceUrl:p.image_source_url,onlineSalesPublished:Number(p.is_published)===1,
          menuCategory:p.menu_category,menuPriceOverride:p.price_override,allergens:(JSON.parse(String(p.allergens_json ?? "[]")) as string[]).join("|"),tags:(JSON.parse(String(p.tags_json ?? "[]")) as string[]).join("|"),menuAvailable:Number(p.is_available)===1,
          menuFeatured:Number(p.is_featured)===1,menuHideOutOfStock:Number(p.hide_when_out_of_stock)===1,menuConsumption:p.stock_consumption_quantity,menuSortOrder:p.menu_sort_order,
          _assetPath:p.image_asset_path,_originalAssets:p.image_original_assets_json });
        if (caps.has(C.WHOLESALE)) Object.assign(record,{dealerPriceA:p.dealer_price_a==null?"":String(p.dealer_price_a),dealerPriceB:p.dealer_price_b==null?"":String(p.dealer_price_b)});
        const unknown = /\[Aktarım: (.*?) doğrulanmalı\.\]/.exec(record.description ?? "")?.[1] ?? "";
        if (unknown.includes("KDV oranı")) record.taxRate="";
        if (unknown.includes("Stok takibi")) record.trackInventory="";
        if (unknown.includes("Alış fiyatı")) record.purchasePrice="";
        records.push(record);
      }
    }
    const fields = options.entity === "products" ? PRODUCT_TRANSFER_FIELDS : CUSTOMER_TRANSFER_FIELDS;
    const headers = Object.keys(fields).filter(h=>(options.entity !== "customers" || options.includeIdentity || !IDENTITY_TRANSFER_FIELDS.includes(h)) && (caps.has(C.WHOLESALE) || !["dealerPriceA","dealerPriceB","companyName","taxOffice","taxNumber","authorizedPerson","dealerStatus","priceGroup","paymentTermDays"].includes(h)));
    return { headers,records,images:records.reduce((sum,r)=>{const originals=JSON.parse(r._originalAssets || "[]") as unknown[];return sum+(originals.length || (r._assetPath || r.imageSourceUrl ? 1 : 0));},0) };
  } finally { db.close(); }
}
export async function createTransferExport(databasePath: string, options: TransferExportOptions, images: TransferImageOwner, assertCurrent:()=>void, progress:(p:TransferProgress)=>void) {
  const collected = collectTransferExport(databasePath,options);
  const assets: Record<string,Uint8Array> = {}, manifest:TransferAsset[] = [],warnings:string[]=[];
  if (collected.records.length > 10000) throw new Error("10.000 kayıt sınırı aşıldı; filtrelenmiş kapsamı kullanın.");
  let imageCount=0,bytesTotal=0;
  for (const [index,record] of collected.records.entries()) {
    assertCurrent();
    progress({stage:"Dosya hazırlanıyor",done:index,total:collected.records.length});
    if (options.format === "zip" && options.includeImages && (record._assetPath || record.imageSourceUrl)) {
      try {
        const originals = JSON.parse(record._originalAssets || "[]") as Array<{assetPath:string;hash:string;format:string}>;
        const sources = originals.length ? originals.map(a=>a.assetPath) : [record._assetPath || ""];
        for (const [imageIndex,source] of sources.entries()) {
          let bytes:Uint8Array;
          if (source) {
            const dataUrl=readProductImageAsset(databasePath,source);
            if(!dataUrl)throw new Error("Yerel görsel bulunamadı.");
            bytes=Buffer.from(dataUrl.split(",")[1]!,"base64");
          } else {
            if(!images.remote)throw new Error("Uzak görsel indirilemedi.");
            bytes=await images.remote(record.imageSourceUrl!);
          }
          assertCurrent();images.validate(bytes);
          bytesTotal+=bytes.length;if(bytesTotal>100*1024*1024)throw new Error("Görsel toplam boyut sınırı aşıldı.");
          const format=imageMime(bytes),hash=transferHash(bytes),assetPath=`assets/${record.id}_${imageIndex}_${hash}.${format.split("/")[1]}`;
          if(originals[imageIndex] && originals[imageIndex].hash!==hash)throw new Error("Orijinal görsel hash doğrulaması başarısız.");
          if(imageIndex===0)record.image=assetPath;
          assets[assetPath]=bytes;manifest.push({path:assetPath,hash,format,productId:record.id!,sku:record.sku ?? ""});imageCount++;
        }
      } catch { warnings.push(`Satır ${index+2}: görsel arşivlenemedi.`); }
    }
    delete record._assetPath;delete record._originalAssets;
    if (index%25===0) await yieldImmediate();
  }
  assertCurrent();
  return {bytes:await encodeTransferFile(options.format,options.entity,collected.headers,collected.records,assets,manifest),records:collected.records.length,images:imageCount,warnings};
}
