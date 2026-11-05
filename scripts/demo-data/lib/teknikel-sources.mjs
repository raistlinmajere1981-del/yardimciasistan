import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { json, sha256File, sha256Text } from "./util.mjs";

const require = createRequire(import.meta.url);
const { productImageFormat } = require("../../../apps/desktop-app/dist-electron/product-image-codec.js");

export const DEFAULT_TEKNIKEL_SOURCE_ROOT = "/home/raistlin/teknikel_catalog_prep";
export const DEFAULT_TEKNIKEL_CUSTOMERS = "/home/raistlin/YardimciWorkspace/teknikel_web/data-import/teknikel-demo-musteriler-30.csv";
export const TEKNIKEL_PHOTO_PROVENANCE = "Teknikel public catalog photography; not synthetic or open-licensed; rights remain with original owners. Demo review use only.";
export const TEKNIKEL_DATA_PROVENANCE = "Real Teknikel catalog names/SKUs and source gross TRY prices; DEMO synthetic stock, purchase cost, dealer prices, descriptions and placeholder tax 20%. Not a commercial offer.";

// BOM, semicolon delimiters, escaped quotes and quoted newlines in the source CSV.
export function parseCustomerCsv(text) {
  const records = [];
  let row = [], value = "", quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && (char === ";" || char === "\n")) {
      row.push(value); value = "";
      if (char === "\n") { if (row.some(Boolean)) records.push(row); row = []; }
    } else value += char;
  }
  if (quoted) throw new Error("Teknikel customer CSV has an unterminated quoted field");
  if (value || row.length) { row.push(value); records.push(row); }
  const headers = records.shift() ?? [];
  const required = ["fullName", "phone", "email", "companyName", "taxOffice", "taxNumber", "authorizedPerson", "dealerStatus", "priceGroup", "paymentTermDays", "address", "notes"];
  if (required.some(key => !headers.includes(key)) || new Set(headers).size !== headers.length) throw new Error("Teknikel customer CSV headers are invalid");
  return records.map((fields, index) => {
    if (fields.length !== headers.length) throw new Error(`Teknikel customer CSV row ${index + 2} has an invalid column count`);
    return Object.fromEntries(headers.map((key, column) => [key, fields[column]]));
  });
}

export function catalogIdentitySha256(products) {
  return sha256Text(json(products.map(p => [p.sku, p.name]).sort((a, b) => a[0].localeCompare(b[0]))));
}

export function loadTeknikelSources({ sourceRoot = DEFAULT_TEKNIKEL_SOURCE_ROOT, customersPath = DEFAULT_TEKNIKEL_CUSTOMERS } = {}) {
  const catalogPath = path.join(sourceRoot, "import-review-catalog.json");
  const imagesPath = path.join(sourceRoot, "image-manifest.json");
  for (const file of [catalogPath, imagesPath, customersPath]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Teknikel source file not found: ${file}. Use --teknikel-source-root (YA_TEKNIKEL_SOURCE_ROOT) and --teknikel-customers to select local sources.`);
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(imagesPath, "utf8"));
  const fail = message => { throw new Error(`Teknikel source validation: ${message}`); };
  if (catalog.products?.length !== 179 || catalog.categories?.length !== 25 || manifest.images?.length !== 68) fail("expected 179 products, 25 categories and 68 originals");
  const categories = new Map(catalog.categories.map(c => [c.source_category_id, c]));
  const products = new Map(catalog.products.map(p => [p.sku, p]));
  if (categories.size !== 25 || products.size !== 179 || categories.get("__OTHER__")?.name !== "Diğer") fail("duplicate identities or missing Diğer category");
  const images = new Map();
  for (const image of manifest.images) {
    const fileName = image.archive_filename;
    if (!/^[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(fileName) || images.has(fileName)) fail("unsafe or duplicate image filename");
    const sourcePath = path.join(sourceRoot, "images-original", fileName);
    if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) fail(`original missing: ${fileName}`);
    if (!/^[a-f0-9]{64}$/.test(image.sha256) || sha256File(sourcePath) !== image.sha256) fail(`SHA-256 mismatch: ${fileName}`);
    const bytes = fs.readFileSync(sourcePath);
    if (bytes.length !== image.size_bytes || image.status !== "archived") fail(`incomplete original: ${fileName}`);
    if (!Array.isArray(image.associated_skus) || !image.associated_skus.length || image.associated_skus.some(sku => !products.get(sku)?.image_files.includes(fileName))) fail(`image SKU association mismatch: ${fileName}`);
    images.set(fileName, { fileName, sourcePath, hash: image.sha256, format: productImageFormat(bytes), sourceUrl: image.url });
  }
  let photographed = 0, published = 0;
  for (const product of products.values()) {
    if (!product.sku || !product.name || !categories.has(product.source_category_id) || categories.get(product.source_category_id).name !== product.category) fail(`invalid product/category: ${product.sku}`);
    if (!Number.isFinite(Number(product.sale_price_gross_try)) || Number(product.sale_price_gross_try) <= 0) fail(`invalid gross TRY price: ${product.sku}`);
    if (!Array.isArray(product.image_files) || product.image_files.length > 12 || new Set(product.image_files).size !== product.image_files.length) fail(`invalid gallery: ${product.sku}`);
    if (product.image_files.some(name => !images.has(name) || !manifest.images.find(image => image.archive_filename === name).associated_skus.includes(product.sku))) fail(`gallery association mismatch: ${product.sku}`);
    if (product.image_files.length) photographed += 1;
    if (product.source_category_id !== "__OTHER__") {
      if (product.needs_category_review || !product.image_files.length) fail(`curated product needs review: ${product.sku}`);
      published += 1;
    }
  }
  if (photographed !== 35 || published !== 28) fail("expected 35 photographed and 28 curated products");
  const customers = parseCustomerCsv(fs.readFileSync(customersPath, "utf8")).map(row => {
    if (!row.fullName.startsWith("DEMO ") || !/^teknikel\.demo\d{2}@example\.(com|test)$/.test(row.email)) fail("customer is not a synthetic Teknikel identity");
    // The canonical demo scanner permits only reserved example.test identities.
    return { ...row, email: row.email.replace(/@example\.com$/, "@example.test") };
  });
  const count = predicate => customers.filter(predicate).length;
  if (customers.length !== 30 || new Set(customers.map(c => c.email)).size !== 30 || count(c => !c.companyName) !== 10) fail("expected 30 unique customers including 10 retail");
  for (const status of ["active", "inactive"]) {
    if (count(c => c.companyName && c.dealerStatus === status) !== 10) fail(`expected 10 ${status} dealers`);
    for (const group of ["dealer_a", "dealer_b"]) if (count(c => c.companyName && c.dealerStatus === status && c.priceGroup === group) !== 5) fail(`expected five ${status} ${group} dealers`);
  }
  return { catalog, images, customers, catalogIdentitySha256: catalogIdentitySha256(catalog.products), sourceHashes: { catalog: sha256File(catalogPath), images: sha256File(imagesPath), customers: sha256File(customersPath) } };
}
