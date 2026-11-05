import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { renderDemoPng } from "./png.mjs";
import { FIXED_NOW, insertRow, json, sha256File, slug, writeJson } from "./util.mjs";

const require = createRequire(import.meta.url);
const shared = require("../../../packages/shared/dist/index.js");

const {
  BUSINESS_CAPABILITIES,
  BUSINESS_PROFILES,
  CORE_BUSINESS_CAPABILITIES,
  businessProfileSupportsCapability,
  expandBusinessCapabilities,
  getBusinessProfile,
  validateBusinessCapabilitySet
} = shared;

const KNOWN_CAPABILITIES = Object.values(BUSINESS_CAPABILITIES);
const SYSTEM_CAPABILITIES = new Set(CORE_BUSINESS_CAPABILITIES);

export function capabilitySetFor(profileId, extraRoots = []) {
  const profile = getBusinessProfile(profileId);
  const selectedRoots = [...new Set([...profile.defaultOptionalCapabilities, ...extraRoots])];
  for (const root of extraRoots) {
    if (!profile.optionalCapabilities.includes(root)) {
      throw new Error(`${root} is not an optional root for profile ${profile.id}`);
    }
  }
  const enabled = expandBusinessCapabilities([
    ...CORE_BUSINESS_CAPABILITIES,
    ...profile.requiredCapabilities,
    ...selectedRoots
  ]);
  for (const capability of enabled) {
    if (!businessProfileSupportsCapability(profile.id, capability)) {
      throw new Error(`${capability} is not supported by profile ${profile.id}`);
    }
  }
  const violations = validateBusinessCapabilitySet(enabled);
  if (violations.length > 0) {
    throw new Error(`Invalid capability set: ${JSON.stringify(violations)}`);
  }
  return { profile, selectedRoots, enabled: new Set(enabled) };
}

export function createDemoContext({ db, pack, folderPath }) {
  const images = new Map();
  const afterCommit = [];
  let primaryLocationId = "";
  const productIds = new Set();

  function addBusinessCapabilities(capabilities) {
    const now = FIXED_NOW;
    const required = new Set([
      ...CORE_BUSINESS_CAPABILITIES,
      ...capabilities.profile.requiredCapabilities
    ]);
    for (const capability of KNOWN_CAPABILITIES) {
      const isEnabled = capabilities.enabled.has(capability);
      const isSelected = capabilities.selectedRoots.includes(capability);
      const source = SYSTEM_CAPABILITIES.has(capability)
        ? "system"
        : isSelected && !capabilities.profile.defaultOptionalCapabilities.includes(capability)
          ? "user"
          : "profile";
      insertRow(db, "business_capabilities", {
        business_id: pack.business.id,
        capability_id: capability,
        is_enabled: isEnabled ? 1 : 0,
        is_selected: isSelected ? 1 : 0,
        source,
        created_at: now,
        updated_at: now
      });
      if (required.has(capability) && !isEnabled) {
        throw new Error(`Required capability ${capability} was not enabled`);
      }
    }
  }

  function addBusiness() {
    const business = pack.business;
    insertRow(db, "business", {
      id: business.id,
      name: business.name,
      display_name: business.displayName,
      profile_id: business.profileId,
      phone: business.phone,
      whatsapp: business.whatsapp,
      email: business.email,
      address: business.address,
      publish_rooms_web: business.publishRoomsWeb ? 1 : 0,
      publish_tables_web: business.publishTablesWeb ? 1 : 0,
      publish_qr_menu_web: business.publishQrMenuWeb ? 1 : 0,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: "",
      sync_status: "local_only"
    });
    insertRow(db, "business_public_profile", {
      map_display_mode: "manual",
      google_maps_embed_url: "",
      business_id: business.id,
      description: business.publicProfile.description,
      about_text: business.publicProfile.about,
      latitude: business.publicProfile.latitude ?? null,
      longitude: business.publicProfile.longitude ?? null,
      directions_note: business.publicProfile.directions,
      check_in_time: business.publicProfile.checkInTime ?? "",
      check_out_time: business.publicProfile.checkOutTime ?? "",
      breakfast_start_time: business.publicProfile.breakfastStartTime ?? "",
      breakfast_end_time: business.publicProfile.breakfastEndTime ?? "",
      features_json: json(business.publicProfile.features ?? []),
      policy_note: business.publicProfile.policyNote ?? "",
      payment_note: business.publicProfile.paymentNote ?? "",
      languages_json: json(["tr", "en"]),
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      sync_status: "local_only"
    });
    insertRow(db, "business_public_social_links", {
      business_id: business.id,
      links_json: "[]",
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      sync_status: "local_only"
    });
  }

  function addSettings(settings = {}) {
    insertRow(db, "settings", {
      id: "settings_primary",
      business_id: pack.business.id,
      web_module_url: "",
      sync_secret: "",
      auto_sync_enabled: 0,
      local_network_enabled: 0,
      ai_provider: "",
      ai_service: "openai",
      google_reviews_enabled: 0,
      birthday_enabled: 1,
      birthday_mode: "manual",
      birthday_send_time: "10:00",
      product_data_enabled: 0,
      dealer_application_enabled: settings.dealerApplicationEnabled ? 1 : 0,
      dealer_portal_enabled: settings.dealerPortalEnabled ? 1 : 0,
      online_sales_pickup_enabled: settings.onlineSalesPickup === false ? 0 : 1,
      online_sales_delivery_enabled: settings.onlineSalesDelivery ? 1 : 0,
      online_sales_shipping_enabled: settings.onlineSalesShipping ? 1 : 0,
      setup_completed: 1,
      app_password_verifier: "",
      app_password_updated_at: "",
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: "",
      sync_status: "local_only"
    });
  }

  function ensurePrimaryLocation() {
    if (primaryLocationId) return primaryLocationId;
    primaryLocationId = `loc_${pack.key}_main`;
    insertRow(db, "inventory_locations", {
      id: primaryLocationId,
      business_id: pack.business.id,
      name: "Ana Depo",
      code: "MAIN",
      is_primary: 1,
      is_active: 1,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: ""
    });
    return primaryLocationId;
  }

  function addProduct(input) {
    const productId = `prd_${pack.key}_${input.key}`;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(productId)) throw new Error(`Unsafe product id ${productId}`);
    if (productIds.has(productId)) throw new Error(`Duplicate product id ${productId}`);
    productIds.add(productId);

    let imageAssetPath = "";
    const originalAssets = [];
    for (const asset of input.originalAssets ?? []) {
      if (!/^[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(asset.fileName)) throw new Error("Unsafe original image filename");
      const assetPath = `assets/products/${productId}/${asset.fileName}`;
      const absolute = path.join(folderPath, assetPath);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.copyFileSync(asset.sourcePath, absolute);
      if (sha256File(absolute) !== asset.hash) throw new Error(`Original image SHA-256 mismatch: ${asset.fileName}`);
      originalAssets.push({ assetPath, hash: asset.hash, format: asset.format });
    }
    if (originalAssets.length) imageAssetPath = originalAssets[0].assetPath;
    if (input.palette) {
      const fileName = `${slug(input.key)}.png`;
      const absolute = path.join(folderPath, "assets", "products", productId, fileName);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      const bytes = renderDemoPng({
        palette: input.palette,
        variant: input.paletteVariant ?? 0
      });
      fs.writeFileSync(absolute, bytes);
      imageAssetPath = `assets/products/${productId}/${fileName}`;
      images.set(productId, { fileName, bytes });
    }

    insertRow(db, "catalog_products", {
      id: productId,
      business_id: pack.business.id,
      category_id: input.categoryId ?? "",
      name: input.name,
      brand: input.brand ?? "Demo Üretici",
      sku: input.sku ?? "",
      barcode: input.barcode ?? "",
      description: input.description ?? "",
      sale_price: input.salePrice,
      dealer_price_a: input.dealerPriceA ?? null,
      dealer_price_b: input.dealerPriceB ?? null,
      sort_order: input.sortOrder ?? 100,
      quick_access_enabled: input.quickAccess ? 1 : 0,
      quick_access_order: input.quickAccessOrder ?? 0,
      purchase_price: input.purchasePrice ?? 0,
      currency: "TRY",
      unit: input.unit ?? "piece",
      tax_rate: input.taxRate ?? 10,
      track_inventory: input.trackInventory === false ? 0 : 1,
      minimum_quantity: input.minimumQuantity ?? 0,
      is_active: 1,
      image_original_assets_json: json(originalAssets),
      image_asset_path: imageAssetPath,
      image_source_url: input.imageSourceUrl ?? "",
      data_source: input.dataSource ?? "demo-data-generator",
      source_product_url: input.sourceProductUrl ?? "",
      data_license: input.dataLicense ?? "Synthetic demo data (project-owned generator)",
      image_license: input.imageLicense ?? (imageAssetPath ? "Original synthetic artwork generated for demo data" : ""),
      source_fetched_at: "",
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: ""
    });
    return { id: productId, name: input.name, salePrice: input.salePrice, barcode: input.barcode ?? "", taxRate: input.taxRate ?? 10 };
  }

  function addInventory(product, quantity, unitCost = 0) {
    const locationId = ensurePrimaryLocation();
    insertRow(db, "inventory_balances", {
      product_id: product.id,
      location_id: locationId,
      quantity,
      updated_at: FIXED_NOW
    });
    insertRow(db, "inventory_movements", {
      id: `mov_${pack.key}_${product.id}`,
      business_id: pack.business.id,
      product_id: product.id,
      location_id: locationId,
      movement_type: "adjust",
      quantity_delta: quantity,
      quantity_after: quantity,
      unit_cost: unitCost,
      reference_type: "demo_seed",
      reference_id: "opening",
      note: "Demo açılış stoğu",
      actor_source: "desktop",
      created_at: FIXED_NOW
    });
    return locationId;
  }

  function addCustomer(input) {
    const customerId = input.id ?? `cus_${pack.key}_${input.key}`;
    insertRow(db, "customers", {
      id: customerId,
      full_name: input.fullName,
      phone: input.phone,
      email: input.email,
      source: "manual",
      notes: input.notes ?? "Sentetik demo müşterisi.",
      last_contact_at: "",
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: "",
      sync_status: "local_only",
      birthday_message_enabled: 0,
      identity_type: "",
      identity_number: "",
      nationality: "TR",
      birth_date: input.birthDate ?? "",
      gender: "",
      document_serial_number: "",
      document_expiry_date: "",
      birth_place: "",
      mother_name: "",
      father_name: "",
      issuing_authority: "",
      address: input.address ?? "",
      business_id: pack.business.id
    });
    return { id: customerId, fullName: input.fullName };
  }

  function addCommercialProfile(customerId, input) {
    insertRow(db, "customer_commercial_profiles", {
      customer_id: customerId,
      business_id: pack.business.id,
      company_name: input.companyName,
      tax_office: input.taxOffice ?? "Demo Vergi Dairesi",
      tax_number: input.taxNumber ?? "",
      authorized_person: input.authorizedPerson ?? "",
      dealer_status: input.dealerStatus ?? "active",
      price_group: input.priceGroup ?? "dealer_a",
      payment_term_days: input.paymentTermDays ?? 30,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW
    });
  }

  function addCategory(input) {
    insertRow(db, "catalog_categories", {
      id: input.id,
      business_id: pack.business.id,
      parent_id: "",
      name: input.name,
      code: input.code ?? "",
      sort_order: input.sortOrder ?? 10,
      is_active: 1,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: ""
    });
    return input.id;
  }

  function addSupplier(input) {
    const supplierId = input.id ?? `sup_${pack.key}_${input.key}`;
    insertRow(db, "commerce_suppliers", {
      id: supplierId,
      business_id: pack.business.id,
      name: input.name,
      phone: input.phone,
      email: input.email,
      tax_number: input.taxNumber ?? "",
      notes: input.notes ?? "Sentetik demo tedarikçisi.",
      is_active: 1,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
      deleted_at: ""
    });
    return supplierId;
  }

  return {
    db,
    pack,
    folderPath,
    capabilities: capabilitySetFor(pack.business.profileId, pack.extraCapabilities ?? []),
    images,
    addBusiness,
    addSettings,
    addBusinessCapabilities,
    runAfterCommit(callback) {
      afterCommit.push(callback);
    },
    commitHooks: afterCommit,
    addProduct,
    addInventory,
    addCustomer,
    addCommercialProfile,
    addCategory,
    addSupplier,
    ensurePrimaryLocation,
    get primaryLocationId() {
      return ensurePrimaryLocation();
    }
  };
}

export function writeBackupManifest(folderPath, pack, qrFiles, assetFileCount, createdAt) {
  const manifest = {
    format: "yardimci-asistan-backup-v2",
    createdAt,
    kind: "manual",
    databaseFile: "yardimci-asistan.sqlite",
    qrMenuImages: {
      directory: "qr-menu-images",
      count: qrFiles.length,
      files: qrFiles
    },
    assets: {
      directory: "assets",
      fileCount: assetFileCount
    }
  };
  writeJson(path.join(folderPath, "backup.json"), manifest);
  return manifest;
}

export { BUSINESS_PROFILES };
