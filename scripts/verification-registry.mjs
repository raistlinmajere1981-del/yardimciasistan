const SMOKE_FILES = [
  "scripts/smoke-ux-consolidation.mjs",
  "scripts/smoke-nexa-assets.mjs",
  "scripts/smoke-desktop-nexa.mjs",
  "scripts/smoke-web-nexa.mjs",
  "scripts/smoke-marketing-analytics.mjs",
  "scripts/smoke-marketing-analytics-ui.mjs",
  "scripts/smoke-marketing-schedules.mjs",
  "scripts/smoke-marketing-schedules-ui.mjs",
  "scripts/smoke-marketing-log-privacy.mjs",
  "scripts/smoke-marketing-multichannel.mjs",
  "scripts/smoke-marketing-multichannel-ui.mjs",
  "scripts/smoke-instagram-staging.mjs",
  "scripts/smoke-showcase-website.mjs",
  "scripts/smoke-marketing-media-native.mjs",
  "scripts/smoke-marketing-studio.mjs",
  "scripts/smoke-marketing-website.mjs",
  "scripts/smoke-marketing-ui.mjs",
  "scripts/smoke-messaging-dispatch.mjs",
  "scripts/smoke-messaging-dispatch-lifecycle.mjs",
  "scripts/smoke-messaging-dispatch-ui.mjs",
  "scripts/smoke-messaging-campaigns.mjs",
  "scripts/smoke-messaging-campaigns-ui.mjs",
  "scripts/smoke-business-messaging-hosting.mjs",
  "scripts/smoke-business-messaging-provider.mjs",
  "scripts/smoke-business-messaging-webhook.php",
  "scripts/smoke-business-messaging-ui.mjs",
  "scripts/smoke-commerce-dealer-orders.mjs",
  "scripts/smoke-commerce-dealer-access.mjs",
  "scripts/smoke-web-dealer-portal.mjs",
  "scripts/smoke-web-storefront.mjs",
  "scripts/smoke-web-order-submission.mjs",
  "scripts/smoke-commerce-online-catalog.mjs",
  "scripts/smoke-commerce-online-catalog-ui.mjs",
  "scripts/smoke-web-orders-storage.php",
  "scripts/smoke-commerce-online-order-ingress.mjs",
  "scripts/smoke-android-connection-preflight.mjs",
  "scripts/smoke-android-daily-task-actions.mjs",
  "scripts/smoke-android-device-approval-hosting.mjs",
  "scripts/smoke-android-device-token.mjs",
  "scripts/smoke-android-device-ui.mjs",
  "scripts/smoke-android-finance-actions.mjs",
  "scripts/smoke-android-hosting-contract.mjs",
  "scripts/smoke-android-permission-matrix.mjs",
  "scripts/smoke-android-release-connection.mjs",
  "scripts/smoke-android-reservation-actions.mjs",
  "scripts/smoke-android-room-folio-actions.mjs",
  "scripts/smoke-app-lock.mjs",
  "scripts/smoke-automatic-sync.mjs",
  "scripts/smoke-birthday-foundation.mjs",
  "scripts/smoke-business-capabilities.mjs",
  "scripts/smoke-business-layout.mjs",
  "scripts/smoke-business-location-geocode.mjs",
  "scripts/smoke-business-public-profile.mjs",
  "scripts/smoke-calendar-workspace.mjs",
  "scripts/smoke-capability-runtime.mjs",
  "scripts/smoke-capability-surface-consistency.mjs",
  "scripts/smoke-clean-start.mjs",
  "scripts/smoke-commerce-foundation.mjs",
  "scripts/smoke-commerce-orders.mjs",
  "scripts/smoke-commerce-shipments.mjs",
  "scripts/smoke-commerce-aras-provider.mjs",
  "scripts/smoke-commerce-aras-ui.mjs",
  "scripts/smoke-commerce-shipment-ipc.mjs",
  "scripts/smoke-commerce-order-fulfillment.mjs",
  "scripts/smoke-commerce-wholesale-customer-profile.mjs",
  "scripts/smoke-commerce-wholesale-ui-contract.mjs",
  "scripts/smoke-commerce-wholesale-customer-ui.mjs",
  "scripts/smoke-commerce-wholesale-pricing.mjs",
  "scripts/smoke-commerce-wholesale-pricing-ui-contract.mjs",
  "scripts/smoke-commerce-wholesale-order-flow.mjs",
  "scripts/smoke-commerce-wholesale-orders-ui-contract.mjs",
  "scripts/smoke-commerce-wholesale-orders-ui.mjs",
  "scripts/smoke-commerce-ipc-contract.mjs",
  "scripts/smoke-commerce-runtime.mjs",
  "scripts/smoke-customer-room-management-db.mjs",
  "scripts/smoke-daily-task-management.mjs",
  "scripts/smoke-dashboard-workspace.mjs",
  "scripts/smoke-data-paths.mjs",
  "scripts/smoke-database-schema.mjs",
  "scripts/smoke-schema-authority.mjs",
  "scripts/smoke-desktop-appearance.mjs",
  "scripts/smoke-desktop-clean-startup.mjs",
  "scripts/smoke-desktop-customer-pension.mjs",
  "scripts/smoke-desktop-design-system.mjs",
  "scripts/smoke-desktop-locale.mjs",
  "scripts/smoke-desktop-lock.mjs",
  "scripts/smoke-desktop-logging-contract.mjs",
  "scripts/smoke-desktop-menu-db.mjs",
  "scripts/smoke-menu-reorder-contract.mjs",
  "scripts/smoke-desktop-package.mjs",
  "scripts/smoke-desktop-renderer.mjs",
  "scripts/smoke-desktop-shell.mjs",
  "scripts/smoke-desktop-windows-data.mjs",
  "scripts/smoke-desktop-xvfb.mjs",
  "scripts/smoke-diagnostics-cli.mjs",
  "scripts/smoke-finance-db.mjs",
  "scripts/smoke-finance-service.mjs",
  "scripts/smoke-finance-workspace.mjs",
  "scripts/smoke-hospitality-domain.mjs",
  "scripts/smoke-hospitality-guests.mjs",
  "scripts/smoke-kbs-domain.mjs",
  "scripts/smoke-live-ai.mjs",
  "scripts/smoke-local-companion-server.mjs",
  "scripts/smoke-manual-reservation.mjs",
  "scripts/smoke-manual-restaurant-reservation.mjs",
  "scripts/smoke-market-android-foundation.mjs",
  "scripts/smoke-market-android-ui-contract.mjs",
  "scripts/smoke-market-barcode-input-contract.mjs",
  "scripts/smoke-market-companion-desktop-inbox.mjs",
  "scripts/smoke-market-customer-credit-foundation.mjs",
  "scripts/smoke-market-customer-credit-ui-contract.mjs",
  "scripts/smoke-market-customer-credit-whatsapp.mjs",
  "scripts/smoke-market-label-printer-contract.mjs",
  "scripts/smoke-market-live-scanner-contract.mjs",
  "scripts/smoke-market-product-data-contract.mjs",
  "scripts/smoke-market-profile-registry.mjs",
  "scripts/smoke-market-quick-sale-contract.mjs",
  "scripts/smoke-market-quick-sale-session.mjs",
  "scripts/smoke-market-sale-runtime.mjs",
  "scripts/smoke-messages-ai-staleness.mjs",
  "scripts/smoke-operations-card-models.mjs",
  "scripts/smoke-operations-cards.mjs",
  "scripts/smoke-operations-projections.mjs",
  "scripts/smoke-pension-workspace.mjs",
  "scripts/smoke-public-room-availability-publication.mjs",
  "scripts/smoke-public-room-availability.php",
  "scripts/smoke-record-deletions.mjs",
  "scripts/smoke-reports-db.mjs",
  "scripts/smoke-restaurant-workspace.mjs",
  "scripts/smoke-room-folio-service.mjs",
  "scripts/smoke-room-folio-table-order-transfer.mjs",
  "scripts/smoke-room-management-capability-contract.mjs",
  "scripts/smoke-room-public-details.mjs",
  "scripts/smoke-sector-feature-contributions.mjs",
  "scripts/smoke-settings-platform.mjs",
  "scripts/smoke-setup-profile-contract.mjs",
  "scripts/smoke-stock-image-analysis.mjs",
  "scripts/smoke-stock-image-import-db.mjs",
  "scripts/smoke-storage-correctness.mjs",
  "scripts/smoke-domain-mutation-ownership.mjs",
  "scripts/smoke-runtime-boundary-lock.mjs",
  "scripts/smoke-runtime-boundary-scope.mjs",
  "scripts/smoke-support-endpoint.mjs",
  "scripts/smoke-sync-timeout.mjs",
  "scripts/smoke-table-categories-db.mjs",
  "scripts/smoke-table-customer.mjs",
  "scripts/smoke-web-connection-test.mjs",
  "scripts/smoke-web-form-api.mjs",
  "scripts/smoke-web-module-menu.mjs",
  "scripts/smoke-web-version.mjs",
  "scripts/smoke-web-widget-branding.mjs",
  "scripts/smoke-web-widget-module.mjs",
  "scripts/smoke-workspace-platform.mjs"
];

export const IGNORED_SMOKE_FILES = new Set([
  // Helper invoked by the Windows installer smoke with a generated data-dir argument.
  "scripts/smoke-desktop-windows-data.mjs"
]);

const MANUAL_SMOKE_FILES = new Set([
  // Requires a real Android device/ADB.
  "scripts/smoke-android-device-ui.mjs",
  // Requires configured live AI credentials/network.
  "scripts/smoke-live-ai.mjs"
]);

const RELEASE_ONLY_SMOKE_FILES = new Set([
  // Requires a packaged Electron directory first.
  "scripts/smoke-desktop-package.mjs"
]);

const PACKAGE_ONLY_SMOKE_FILES = new Set([
  "scripts/smoke-web-orders-storage.php",
  "scripts/smoke-android-connection-preflight.mjs",
  "scripts/smoke-android-device-approval-hosting.mjs",
  "scripts/smoke-android-device-token.mjs",
  "scripts/smoke-android-hosting-contract.mjs",
  "scripts/smoke-android-release-connection.mjs",
  "scripts/smoke-public-room-availability-publication.mjs",
  "scripts/smoke-public-room-availability.php",
  "scripts/smoke-stock-image-analysis.mjs",
  "scripts/smoke-live-ai.mjs",
  "scripts/smoke-sync-timeout.mjs",
  "scripts/smoke-web-form-api.mjs",
  "scripts/smoke-web-module-menu.mjs",
  "scripts/smoke-web-widget-branding.mjs",
  "scripts/smoke-web-widget-module.mjs"
]);

const LINUX_ONLY_SMOKE_FILES = new Set([
  "scripts/smoke-desktop-xvfb.mjs"
]);

const BASE_CHECKS = [
  check("business-ai-boundary", "AI business domain authority contract", "node", ["scripts/smoke-business-ai-boundary.mjs"], {
    phase: 50, presets: ["full"], domains: ["platform", "web", "marketing"], requires: ["build-desktop", "php-lint"]
  }),
  check("installation-registry-tests", "Installation registry sözleşmesi", "node", ["--test", "scripts/test-installation-registry.mjs"], {
    phase: 5, presets: ["dev", "full"], domains: ["platform"]
  }),
  check("version-contract-tests", "Ürün sürüm sözleşmesi testleri", "node", ["--test", "scripts/test-product-version.mjs"], {
    phase: 5, presets: ["full"], domains: ["platform"]
  }),
  check("version-check", "Ürün sürümü tutarlılığı", "node", ["scripts/product-version.mjs", "check"], {
    phase: 5, presets: ["dev", "full"], domains: ["platform"]
  }),
  check("verification-registry-tests", "Doğrulama registry testleri", "node", ["--test", "scripts/test-verification-registry.mjs"], {
    phase: 5, presets: ["full"], domains: ["platform"]
  }),
  check("admin-tests", "Admin Control Center doğrulaması", "npm", ["run", "test:admin"], {
    phase: 5, presets: ["full"], domains: ["platform"]
  }),
  check("doctor", "Geliştirme ortamı kontrolü", "node", ["scripts/dev-doctor.mjs"], {
    phase: 10, presets: ["dev", "full"], domains: ["platform"]
  }),
  check("typecheck", "Tüm workspace TypeScript kontrolleri", "npm", ["run", "typecheck"], {
    phase: 15, presets: ["dev", "full"], domains: ["platform"]
  }),
  check("typecheck-electron", "Electron TypeScript kontrolü", "npm", ["run", "typecheck:electron"], {
    phase: 15, presets: ["full"], domains: ["desktop", "hospitality", "finance", "commerce", "android", "business-messaging"]
  }),
  check("unit-tests", "Tüm workspace birim testleri", "npm", ["test"], {
    phase: 20, presets: ["full"], domains: ["platform"]
  }),
  check("build-packages", "Ortak paketleri derle", "npm", ["run", "build:packages"], {
    phase: 25, presets: ["full"], domains: ["platform"]
  }),
  check("build-desktop", "Desktop uygulamasını derle", "npm", ["run", "build", "-w", "@yardimci-asistan/desktop-app"], {
    phase: 26, presets: ["full"], domains: ["desktop", "hospitality", "finance", "commerce", "android"],
    requires: ["build-packages"]
  }),
  check("build-android-debug", "Android testleri + debug APK", "npm", ["run", "smoke:android:build"], {
    phase: 27, presets: ["full"], domains: ["android"],
    requires: ["version-check"]
  }),
  check("php-lint", "Web modülü PHP lint", "node", ["scripts/php-lint.mjs"], {
    phase: 20, presets: ["full"], domains: ["web", "business-messaging"]
  }),
  check("local-lab", "Yerel web laboratuvarı", "node", ["scripts/local-dev-lab.mjs", "--once"], {
    phase: 35, presets: ["full"], domains: ["web"],
    requires: ["build-packages", "php-lint"]
  }),
  check("android-hosting-runtime", "Android hosting akışı", "node", ["scripts/android-phone-test.mjs", "--once", "--no-adb", "--no-build"], {
    phase: 45, presets: ["full"], domains: ["android", "web"],
    requires: ["build-packages", "build-desktop"]
  }),
  check("e2e", "Playwright E2E", "npm", ["run", "e2e"], {
    phase: 60, presets: ["full"], domains: ["desktop"],
    requires: ["build-desktop"]
  }),
  check("lint-strict", "Lint strict", "npm", ["run", "lint:strict"], {
    phase: 70, presets: ["dev", "pre-main"], domains: ["platform"]
  }),
  check("knip-strict", "Knip strict", "npm", ["run", "knip:strict"], {
    phase: 71, presets: ["pre-main"], domains: ["platform"]
  }),
  check("design-audit-strict", "Tasarım sistemi denetimi", "npm", ["run", "design:audit:strict"], {
    phase: 72, presets: ["pre-main"], domains: ["desktop"]
  }),
  check("architecture-audit", "Mimari denetim", "npm", ["run", "architecture:audit"], {
    phase: 73, presets: ["pre-main"], domains: ["platform"]
  }),
  check("git-diff-check", "Git whitespace kontrolü", "git", ["diff", "--check"], {
    phase: 79, presets: ["pre-main"], domains: ["platform"]
  }),
  check("package-web-module", "Web modülü paketleme doğrulaması", "node", ["scripts/package-web-module.mjs"], {
    phase: 85, presets: ["release"], domains: ["web", "release"],
    requires: ["build-packages"]
  }),
  check("package-desktop-dir", "Desktop unpacked paket üretimi", "npm", ["run", "pack:dir", "-w", "@yardimci-asistan/desktop-app"], {
    phase: 86, presets: ["release"], domains: ["desktop", "release"],
    requires: ["build-desktop", "version-check"]
  }),
  check("android-release-apk", "Android release APK", "npm", ["run", "android:release-apk"], {
    phase: 87, presets: ["release"], domains: ["android", "release"],
    requires: ["version-check"]
  }),
  check("android-release-aab", "Android release AAB", "npm", ["run", "android:release-aab"], {
    phase: 88, presets: ["release"], domains: ["android", "release"],
    requires: ["version-check"]
  })
];

const SMOKE_CHECKS = SMOKE_FILES
  .filter((file) => !IGNORED_SMOKE_FILES.has(file))
  .map((file) => {
    const manual = MANUAL_SMOKE_FILES.has(file);
    const releaseOnly = RELEASE_ONLY_SMOKE_FILES.has(file);
    const command = file.endsWith(".php") ? "php" : "node";
    const requires = smokeRequires(file);
    const args = file === "scripts/smoke-android-device-ui.mjs" ? [file, "--no-build"] : [file];
    const options = {
      phase: releaseOnly ? 90 : 50,
      presets: manual ? [] : releaseOnly ? ["release"] : ["full"],
      domains: smokeDomains(file),
      requires,
      manual,
      platforms: LINUX_ONLY_SMOKE_FILES.has(file) ? ["linux"] : undefined
    };
    return check(smokeId(file), smokeLabel(file), command, args, options);
  });

export const VERIFICATION_CHECKS = [...BASE_CHECKS, ...SMOKE_CHECKS];

export const PRESET_LAYERS = {
  dev: ["dev"],
  full: ["full"],
  "pre-main": ["full", "pre-main"],
  release: ["full", "pre-main", "release"]
};

export const VERIFICATION_PRESETS = Object.freeze(Object.keys(PRESET_LAYERS));

export function getVerificationCheck(id) {
  return VERIFICATION_CHECKS.find((item) => item.id === id);
}

export function verificationDomains() {
  return [...new Set(
    VERIFICATION_CHECKS
      .filter((item) => item.presets.includes("full") || item.manual)
      .flatMap((item) => item.domains)
  )].sort();
}

export function createVerificationPlan({ preset, domain, checkId, includeManual = false, platform = process.platform } = {}) {
  const selectors = [Boolean(preset), Boolean(domain), Boolean(checkId)].filter(Boolean).length;
  if (selectors !== 1) {
    throw new Error("Tam olarak bir seçim gerekli: --preset, --domain veya --check.");
  }
  if (preset && !PRESET_LAYERS[preset]) {
    throw new Error(`Bilinmeyen preset: ${preset}. Geçerli: ${VERIFICATION_PRESETS.join(", ")}`);
  }
  if (domain && !verificationDomains().includes(domain)) {
    throw new Error(`Bilinmeyen domain: ${domain}. Geçerli: ${verificationDomains().join(", ")}`);
  }
  if (checkId && !getVerificationCheck(checkId)) {
    throw new Error(`Bilinmeyen kontrol: ${checkId}`);
  }

  let roots;
  if (preset) {
    const layers = new Set(PRESET_LAYERS[preset]);
    roots = VERIFICATION_CHECKS.filter((item) =>
      item.presets.some((value) => layers.has(value))
      && (includeManual || !item.manual)
      && supportsPlatform(item, platform)
    );
  } else if (domain) {
    roots = VERIFICATION_CHECKS.filter((item) =>
      item.domains.includes(domain)
      && (item.presets.includes("full") || (includeManual && item.manual))
      && (includeManual || !item.manual)
      && supportsPlatform(item, platform)
    );
  } else {
    const direct = getVerificationCheck(checkId);
    if (!supportsPlatform(direct, platform)) {
      throw new Error(`${checkId} bu platformda çalışmaz: ${platform}`);
    }
    if (direct.manual && !includeManual) {
      throw new Error(`${checkId} manuel kontrol. --include-manual ile açıkça etkinleştirin.`);
    }
    roots = [direct];
  }

  roots.sort(compareChecks);
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  for (const root of roots) visit(root.id, ordered, visiting, visited, platform);
  return ordered;
}

export function validateVerificationRegistry() {
  const errors = [];
  const byId = new Map();
  const signatures = new Map();

  for (const item of VERIFICATION_CHECKS) {
    if (byId.has(item.id)) errors.push(`yinelenen id: ${item.id}`);
    byId.set(item.id, item);
    if (!item.command || !Array.isArray(item.args)) errors.push(`${item.id}: command/args eksik`);
    if (!Array.isArray(item.domains) || item.domains.length === 0) errors.push(`${item.id}: domain eksik`);
    if (!Array.isArray(item.presets)) errors.push(`${item.id}: presets dizi olmalı`);
    const signature = [item.command, ...item.args].join("\u0000");
    if (signatures.has(signature)) {
      errors.push(`aynı komut iki kez tanımlı: ${signatures.get(signature)} / ${item.id}`);
    } else {
      signatures.set(signature, item.id);
    }
  }

  for (const item of VERIFICATION_CHECKS) {
    for (const dependency of item.requires) {
      if (!byId.has(dependency)) errors.push(`${item.id}: bilinmeyen prerequisite ${dependency}`);
      if (dependency === item.id) errors.push(`${item.id}: kendine bağımlı`);
    }
  }

  try {
    for (const item of VERIFICATION_CHECKS) {
      createVerificationPlan({ checkId: item.id, includeManual: true, platform: item.platforms?.[0] ?? process.platform });
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
}

function visit(id, ordered, visiting, visited, platform) {
  if (visited.has(id)) return;
  if (visiting.has(id)) throw new Error(`Doğrulama dependency döngüsü: ${[...visiting, id].join(" -> ")}`);
  const item = getVerificationCheck(id);
  if (!item) throw new Error(`Registry kontrolü bulunamadı: ${id}`);
  if (!supportsPlatform(item, platform)) return;
  visiting.add(id);
  for (const dependency of item.requires) visit(dependency, ordered, visiting, visited, platform);
  visiting.delete(id);
  visited.add(id);
  ordered.push(item);
}

function check(id, label, command, args, {
  phase = 50,
  presets = [],
  domains = ["platform"],
  requires = [],
  manual = false,
  platforms
} = {}) {
  return {
    id,
    label,
    command,
    args,
    phase,
    presets,
    domains: [...new Set(domains)],
    requires: [...new Set(requires)],
    manual,
    platforms
  };
}

function compareChecks(a, b) {
  return a.phase - b.phase || a.id.localeCompare(b.id, "en");
}

function supportsPlatform(item, platform) {
  return !item.platforms || item.platforms.includes(platform);
}

function smokeId(file) {
  return file
    .replace(/^scripts\//, "")
    .replace(/^smoke-/, "")
    .replace(/\.(mjs|php)$/, "")
    .replace(/[^a-z0-9]+/g, "-");
}

function smokeLabel(file) {
  return file
    .replace(/^scripts\/smoke-/, "")
    .replace(/\.(mjs|php)$/, "")
    .replaceAll("-", " ");
}

function smokeRequires(file) {
  if (file === "scripts/smoke-nexa-assets.mjs") return [];
  if (file === "scripts/smoke-web-nexa.mjs") return ["build-packages"];
  if (file === "scripts/smoke-marketing-log-privacy.mjs") return ["php-lint"];
  if (file === "scripts/smoke-instagram-staging.mjs") return ["php-lint"];
  if (file === "scripts/smoke-showcase-website.mjs" || file === "scripts/smoke-marketing-website.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-business-messaging-hosting.mjs" || file === "scripts/smoke-business-messaging-webhook.php") return ["php-lint"];
  if (file === "scripts/smoke-web-dealer-portal.mjs" || file === "scripts/smoke-commerce-dealer-orders.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-web-storefront.mjs") return ["php-lint"];
  if (file === "scripts/smoke-web-order-submission.mjs") return ["php-lint"];
  if (file === "scripts/smoke-support-endpoint.mjs" || file === "scripts/smoke-web-version.mjs") return [];
  if (file === "scripts/smoke-desktop-package.mjs") return ["package-desktop-dir"];
  if (file === "scripts/smoke-android-device-ui.mjs") {
    return ["build-packages", "build-desktop", "build-android-debug"];
  }
  if (PACKAGE_ONLY_SMOKE_FILES.has(file)) return ["build-packages"];
  return ["build-packages", "build-desktop"];
}

function smokeDomains(file) {
  const name = file.replace(/^scripts\/smoke-/, "").replace(/\.(mjs|php)$/, "");

  if (name === "nexa-assets") return ["desktop", "web", "platform"];
  if (name === "storage-correctness") return ["hospitality", "finance", "web", "platform"];
  if (name === "schema-authority") return ["platform", "hospitality", "finance", "customers", "web"];
  if (name === "domain-mutation-ownership") return ["commerce", "hospitality", "finance", "android", "customers"];
  if (/^runtime-boundary-/.test(name)) return ["platform", "desktop", "hospitality", "finance", "customers", "android"];
  const domains = new Set();
  if (/marketing-|showcase-|instagram-/.test(name)) domains.add("marketing");
  if (name === "marketing-log-privacy") domains.add("diagnostics");
  if (/messaging-dispatch/.test(name)) { domains.add("messaging-dispatch"); domains.add("business-messaging"); domains.add("customers"); domains.add("platform"); }
  if (/messaging-campaigns/.test(name)) { domains.add("messaging-campaigns"); domains.add("business-messaging"); domains.add("customers"); domains.add("platform"); }
  if (/dealer-access|dealer-portal|wholesale-customer-ui\.mjs/.test(file)) domains.add("dealer-access");

  if (/android/.test(name)) domains.add("android");
  if (/web|sync|public-room|connection/.test(name)) domains.add("web");
  if (/market(?!ing)|commerce|menu|stock|barcode|label/.test(name)) domains.add("commerce");
  if (/pension|restaurant|hospitality|room|reservation|table/.test(name)) domains.add("hospitality");
  if (/finance|folio|transfer/.test(name)) {
    domains.add("finance");
    domains.add("hospitality");
  }
  if (/business-messaging/.test(name)) { domains.add("customers"); domains.add("web"); domains.add("platform"); }
  if (/business-messaging/.test(name) || [
    "scripts/smoke-market-customer-credit-whatsapp.mjs",
    "scripts/smoke-birthday-foundation.mjs",
    "scripts/smoke-settings-platform.mjs",
    "scripts/smoke-commerce-aras-provider.mjs",
    "scripts/smoke-commerce-aras-ui.mjs",
    "scripts/smoke-commerce-dealer-orders.mjs",
    "scripts/smoke-commerce-online-order-ingress.mjs",
    "scripts/smoke-automatic-sync.mjs",
    "scripts/smoke-database-schema.mjs",
    "scripts/smoke-desktop-logging-contract.mjs"
  ].includes(file)) domains.add("business-messaging");
  if (/customer|birthday|messages/.test(name)) domains.add("customers");
  if (/desktop|workspace|dashboard|calendar|settings|appearance|locale|sector|app-lock|reports|business-layout/.test(name)) {
    domains.add("desktop");
  }
  if (/diagnostic|logging/.test(name)) domains.add("diagnostics");
  if (/capability|business-|setup-profile|database-schema|data-paths|deletions/.test(name)) domains.add("platform");

  // Cross-domain flows whose filenames do not fully describe ownership.
  if (name === "clean-start") {
    domains.add("desktop");
    domains.add("platform");
  }
  if (name === "automatic-sync") domains.add("android");
  if (name === "local-companion-server") {
    domains.add("android");
    domains.add("desktop");
  }
  if (name === "market-companion-desktop-inbox") domains.add("android");
  if (name === "web-connection-test") domains.add("desktop");
  if (name === "kbs-domain") {
    domains.add("hospitality");
    domains.add("customers");
    domains.add("desktop");
  }
  if (name === "support-endpoint") {
    domains.add("diagnostics");
    domains.add("web");
  }

  if (domains.size === 0) domains.add("platform");
  return [...domains];
}
