const SMOKE_FILES = [
  "scripts/smoke-companion-points-ingress.mjs",
  "scripts/smoke-c19-android-fixture.mjs",
  "scripts/smoke-document-output-render-snapshot.mjs",
  "scripts/smoke-form-image-perspective.mjs",
  "scripts/smoke-document-output-management.mjs",
  "scripts/smoke-document-output.mjs",
  "scripts/smoke-document-output-sale-source.mjs",
  "scripts/smoke-document-output-sale-job.mjs",
  "scripts/smoke-document-output-pdf.mjs",
  "scripts/smoke-print-management-ui.mjs",
  "scripts/smoke-table-order-benefits-ui.mjs",
  "scripts/smoke-table-order-benefits.mjs",
  "scripts/smoke-commerce-benefits-management.mjs",
  "scripts/smoke-commerce-benefits-management-ui.mjs",
  "scripts/smoke-commerce-benefits.mjs",
  "scripts/smoke-commerce-order-benefits.mjs",
  "scripts/smoke-commerce-order-benefits-ui.mjs",
  "scripts/smoke-market-sale-benefits.mjs",
  "scripts/smoke-market-sale-full-refund.mjs",
  "scripts/smoke-market-sale-full-refund-preview.mjs",
  "scripts/smoke-market-sale-full-refund-ui.mjs",
  "scripts/smoke-market-sale-benefits-preview.mjs",
  "scripts/smoke-market-sale-benefits-ui.mjs",
  "scripts/smoke-android-benefits-financial-boundary.mjs",
  "scripts/smoke-android-benefits-spend-grants.mjs",
  "scripts/smoke-android-customer-sale-preview.mjs",
  "scripts/smoke-android-customer-sale-preview-server.mjs",
  "scripts/smoke-android-device-authorization-epoch.mjs",
  "scripts/smoke-android-local-business-summary.mjs",
  "scripts/smoke-android-point-spend-quote.mjs",
  "scripts/smoke-android-point-spend-quote-server.mjs",
  "scripts/smoke-android-sale-ack-https.mjs",
  "scripts/smoke-android-sale-action-receipt.mjs",
  "scripts/smoke-android-sale-history.mjs",
  "scripts/smoke-android-sale-owner-refund.mjs",
  "scripts/smoke-android-sale-source-boundary.mjs",
  "scripts/smoke-android-sale-source-schema-compatibility.mjs",
  "scripts/smoke-companion-benefits-parent-contract.mjs",
  "scripts/smoke-companion-coupon-permit.mjs",
  "scripts/smoke-companion-coupon-sale.mjs",
  "scripts/smoke-companion-points-principal.mjs",
  "scripts/smoke-companion-points-production-path.mjs",
  "scripts/smoke-connection-status.mjs",
  "scripts/smoke-demo-two-layer.mjs",
  "scripts/smoke-web-site-template.mjs",
  "scripts/smoke-customer-accounts.mjs",
  "scripts/smoke-desktop-visible-updater.mjs",
  "scripts/smoke-entity-single-card.mjs",
  "scripts/smoke-data-transfer.mjs",
  "scripts/smoke-data-transfer-ui.mjs",
  "scripts/smoke-product-photos.mjs",
  "scripts/smoke-product-photos-ui.mjs",
  "scripts/smoke-dealer-android-device.mjs",
  "scripts/smoke-market-pilot-web.mjs",
  "scripts/smoke-desktop-ui-family.mjs",
  "scripts/smoke-public-translations.mjs",
  "scripts/smoke-public-translations-web.mjs",
  "scripts/smoke-public-translations-ui.mjs",
  "scripts/smoke-web-data-service.mjs",
  "scripts/smoke-android-auto-repair.mjs",
  "scripts/smoke-web-table-smoking-icons.mjs",
  "scripts/smoke-android-companion-v3.mjs",
  "scripts/smoke-record-picker-ui.mjs",
  "scripts/smoke-feature-dependencies.mjs",
  "scripts/smoke-profile-transition.mjs",
  "scripts/smoke-profile-transition-ui.mjs",
  "scripts/smoke-sales-correctness.mjs",
  "scripts/smoke-sales-workspace-ui.mjs",
  "scripts/smoke-catalog-pagination.mjs",
  "scripts/smoke-settings-correctness.mjs",
  "scripts/smoke-settings-ui-correctness.mjs",
  "scripts/smoke-ai-connection-cancel.mjs",
  "scripts/smoke-ai-connection-cancel-ui.mjs",
  "scripts/smoke-backup-zip-import.mjs",
  "scripts/smoke-backup-zip-import-ui.mjs",
  "scripts/smoke-teknikel-shipping-repair-ui.mjs",
  "scripts/smoke-voice-stt-settings.mjs",
  "scripts/smoke-voice-stt-provider.php",
  "scripts/smoke-voice-stt-publication.mjs",
  "scripts/smoke-voice-stt-hosting.mjs",
  "scripts/smoke-voice-stt-ui.mjs",
  "scripts/smoke-voice-stt-desktop.mjs",
  "scripts/smoke-voice-stt-desktop-ui.mjs",
  "scripts/smoke-voice-stt-android.mjs",
  "scripts/smoke-desktop-ui-correctness.mjs",
  "scripts/smoke-publication-protocol.mjs",
  "scripts/smoke-sync-publication-correctness.mjs",
  "scripts/smoke-ux-consolidation.mjs",
  "scripts/smoke-nexa-assets.mjs",
  "scripts/smoke-desktop-nexa.mjs",
  "scripts/smoke-web-nexa.mjs",
  "scripts/smoke-marketing-analytics.mjs",
  "scripts/smoke-marketing-analytics-ui.mjs",
  "scripts/smoke-marketing-schedules.mjs",
  "scripts/smoke-marketing-schedules-ui.mjs",
  "scripts/smoke-marketing-plan-unified-ui.mjs",
  "scripts/smoke-marketing-log-privacy.mjs",
  "scripts/smoke-marketing-multichannel.mjs",
  "scripts/smoke-marketing-multichannel-ui.mjs",
  "scripts/smoke-instagram-staging.mjs",
  "scripts/smoke-instagram-oauth-web.mjs",
  "scripts/smoke-instagram-oauth-settings-ui.mjs",
  "scripts/smoke-instagram-oauth-cancel.mjs",
  "scripts/smoke-instagram-staged-activation.mjs",
  "scripts/smoke-instagram-oauth-refresh.mjs",
  "scripts/smoke-showcase-website.mjs",
  "scripts/smoke-marketing-media-native.mjs",
  "scripts/smoke-marketing-studio.mjs",
  "scripts/smoke-marketing-share.mjs",
  "scripts/smoke-marketing-image-only-ui.mjs",
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
  "scripts/smoke-dealer-applications.mjs",
  "scripts/smoke-web-dealer-portal.mjs",
  "scripts/smoke-web-storefront.mjs",
  "scripts/smoke-web-order-submission.mjs",
  "scripts/smoke-commerce-online-catalog.mjs",
  "scripts/smoke-commerce-product-media-publication.mjs",
  "scripts/smoke-commerce-online-catalog-ui.mjs",
  "scripts/smoke-web-orders-storage.php",
  "scripts/smoke-commerce-online-order-ingress.mjs",
  "scripts/smoke-android-connection-preflight.mjs",
  "scripts/smoke-android-daily-task-actions.mjs",
  "scripts/smoke-android-device-approval-hosting.mjs",
  "scripts/smoke-android-device-token.mjs",
  "scripts/smoke-android-device-ui.mjs",
  "scripts/smoke-android-native-ui-family.mjs",
  "scripts/smoke-companion-device-retry.mjs",
  "scripts/smoke-android-finance-actions.mjs",
  "scripts/smoke-android-hosting-contract.mjs",
  "scripts/smoke-android-permission-matrix.mjs",
  "scripts/smoke-android-release-connection.mjs",
  "scripts/smoke-android-reservation-actions.mjs",
  "scripts/smoke-android-room-folio-actions.mjs",
  "scripts/smoke-android-kbs.mjs",
  "scripts/smoke-android-kbs-hosting.mjs",
  "scripts/smoke-app-lock.mjs",
  "scripts/smoke-automatic-sync.mjs",
  "scripts/smoke-birthday-foundation.mjs",
  "scripts/smoke-business-capabilities.mjs",
  "scripts/smoke-business-layout.mjs",
  "scripts/smoke-business-location-geocode.mjs",
  "scripts/smoke-business-public-profile.mjs",
  "scripts/smoke-business-gallery-ui.mjs",
  "scripts/smoke-business-gallery-storage.mjs",
  "scripts/smoke-business-site-pages.mjs",
  "scripts/smoke-calendar-workspace.mjs",
  "scripts/smoke-capability-runtime.mjs",
  "scripts/smoke-capability-settings-source.mjs",
  "scripts/smoke-customer-capability-filters.mjs",
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
  "scripts/smoke-daily-ai-fallback.mjs",
  "scripts/smoke-data-paths.mjs",
  "scripts/smoke-database-schema.mjs",
  "scripts/smoke-schema-authority.mjs",
  "scripts/smoke-desktop-appearance.mjs",
  "scripts/smoke-desktop-clean-startup.mjs",
  "scripts/smoke-desktop-customer-pension.mjs",
  "scripts/smoke-identity-camera-recovery.mjs",
  "scripts/smoke-desktop-tts.mjs",
  "scripts/smoke-desktop-tts-ui.mjs",
  "scripts/smoke-desktop-design-system.mjs",
  "scripts/smoke-desktop-locale.mjs",
  "scripts/smoke-desktop-lock.mjs",
  "scripts/smoke-desktop-logging-contract.mjs",
  "scripts/smoke-desktop-menu-db.mjs",
  "scripts/smoke-menu-product-identity.mjs",
  "scripts/smoke-menu-reorder-contract.mjs",
  "scripts/smoke-desktop-package.mjs",
  "scripts/smoke-desktop-renderer.mjs",
  "scripts/smoke-desktop-shell.mjs",
  "scripts/smoke-desktop-windows-data.mjs",
  "scripts/smoke-desktop-xvfb.mjs",
  "scripts/smoke-diagnostics-cli.mjs",
  "scripts/smoke-finance-db.mjs",
  "scripts/smoke-finance-source-ownership.mjs",
  "scripts/smoke-finance-service.mjs",
  "scripts/smoke-finance-workspace.mjs",
  "scripts/smoke-hospitality-domain.mjs",
  "scripts/smoke-hospitality-guests.mjs",
  "scripts/smoke-kbs-domain.mjs",
  "scripts/smoke-live-ai.mjs",
  "scripts/smoke-local-companion-server.mjs",
  "scripts/smoke-local-companion-tls.mjs",
  "scripts/smoke-local-pairing-qr.mjs",
  "scripts/smoke-local-pairing-security.mjs",
  "scripts/smoke-manual-reservation.mjs",
  "scripts/smoke-manual-restaurant-reservation.mjs",
  "scripts/smoke-market-android-foundation.mjs",
  "scripts/smoke-market-android-sales.mjs",
  "scripts/smoke-market-android-sales-hosting.mjs",
  "scripts/smoke-market-android-ui-contract.mjs",
  "scripts/smoke-market-barcode-input-contract.mjs",
  "scripts/smoke-market-companion-desktop-inbox.mjs",
  "scripts/smoke-market-customer-credit-foundation.mjs",
  "scripts/smoke-market-customer-credit-ui-contract.mjs",
  "scripts/smoke-market-customer-credit-whatsapp.mjs",
  "scripts/smoke-market-label-printer-contract.mjs",
  "scripts/smoke-market-live-scanner-contract.mjs",
  "scripts/smoke-market-product-data-contract.mjs",
  "scripts/smoke-commerce-product-media.mjs",
  "scripts/smoke-market-profile-registry.mjs",
  "scripts/smoke-market-quick-sale-contract.mjs",
  "scripts/smoke-market-quick-sale-session.mjs",
  "scripts/smoke-market-sale-runtime.mjs",
  "scripts/smoke-market-sale-finance.mjs",
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
  "scripts/smoke-service-prerequisites.mjs",
  "scripts/smoke-service-tiles-ui.mjs",
  "scripts/smoke-setup-profile-contract.mjs",
  "scripts/smoke-stock-image-analysis.mjs",
  "scripts/smoke-stock-image-import-db.mjs",
  "scripts/smoke-stock-image-ipc.mjs",
  "scripts/smoke-stock-image-market-ui.mjs",
  "scripts/smoke-storage-correctness.mjs",
  "scripts/smoke-domain-mutation-ownership.mjs",
  "scripts/smoke-runtime-boundary-lock.mjs",
  "scripts/smoke-runtime-boundary-scope.mjs",
  "scripts/smoke-runtime-application-operations.mjs",
  "scripts/smoke-support-endpoint.mjs",
  "scripts/smoke-sync-timeout.mjs",
  "scripts/smoke-table-categories-db.mjs",
  "scripts/smoke-table-customer.mjs",
  "scripts/smoke-web-connection-test.mjs",
  "scripts/smoke-web-explicit-source.mjs",
  "scripts/smoke-windows-demo-restore.mjs",
  "scripts/smoke-web-form-api.mjs",
  "scripts/smoke-web-module-menu.mjs",
  "scripts/smoke-web-traffic-e2e.mjs",
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
  // Requires prebuilt A/B/C ZIPs in artifacts/demo-data (generate-demo-data.mjs).
  "scripts/smoke-backup-zip-import.mjs",
  // Native Electron PDF host check requires Linux utilities (pdfinfo/pdftotext).
  "scripts/smoke-document-output-pdf.mjs",
  "scripts/smoke-dealer-android-device.mjs",
  // Requires a real Android device/ADB.
  "scripts/smoke-android-device-ui.mjs",
  "scripts/smoke-android-native-ui-family.mjs",
  "scripts/smoke-companion-device-retry.mjs",
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
  "scripts/smoke-c19-android-fixture.mjs",
  "scripts/smoke-document-output-pdf.mjs",
  "scripts/smoke-desktop-xvfb.mjs"
]);

const BASE_CHECKS = [
  check("demo-data-tests", "Varsayılan A/B/C backup-v2 demo paketleri", "node", ["--test", "scripts/demo-data/demo-data.test.mjs"], {
    phase: 50, presets: ["full"], domains: ["desktop", "commerce"], requires: ["build-desktop"]
  }),
  check("demo-data-teknikel-tests", "İsteğe bağlı Teknikel kaynakları ve backup-v2 ZIP içe aktarma", "node", ["--test", "scripts/demo-data/teknikel.test.mjs"], {
    phase: 50, manual: true, domains: ["desktop", "commerce"], requires: ["build-desktop"]
  }),
  check("web-account-session", "Ortak web hesabı ve özel görünüm yaşam döngüsü", "node", ["--test", "scripts/test-helpers/account-session.test.mjs"], {
    phase: 5, presets: ["full"], domains: ["web", "dealer-access"]
  }),
  check("web-traffic-php-tests", "Anonim site trafiği saklama, dedupe ve rapor sözleşmesi", "php", ["scripts/test-web-traffic.php"], {
    phase: 5, presets: ["dev", "full"], domains: ["web"]
  }),
  check("web-traffic-js-tests", "Site trafiği beacon gizlilik ve dayanıklılık testleri", "node", ["--test", "scripts/test-web-traffic.mjs"], {
    phase: 5, presets: ["dev", "full"], domains: ["web"]
  }),
  check("account-order-receipt", "Hesap kapsamında salt okunur sipariş sonucu kurtarma", "node", ["scripts/test-account-order-receipt.mjs"], {
    phase: 50, presets: ["full"], domains: ["web", "commerce", "dealer-access"]
  }),
  check("image-inspector-core", "Ortak fotoğraf motoru: native golden pikseller ve durum kuralları", "node", ["--test", "packages/image-inspector/test/core.test.mjs"], {
    phase: 5, domains: ["android", "web", "commerce"]
  }),
  check("image-inspector-browser", "Ortak fotoğraf motoru: responsive tarayıcı, Worker ve gizlilik", "node", ["packages/image-inspector/test/browser.mjs"], {
    phase: 50, domains: ["android", "web", "commerce"]
  }),
  check("image-inspector-device-build", "Ortak fotoğraf motoru: Android cihaz test APK derlemesi", "node", ["scripts/run-android-gradle.mjs", "--dealer", "--offline", "assembleDebug", "assembleDebugAndroidTest"], {
    phase: 27, domains: ["android"]
  }),
  check("image-inspector-distribution", "Ortak fotoğraf motoru: kaynak, Teknikel ve APK byte eşitliği", "node", ["packages/image-inspector/test/distribution.mjs", "../teknikel_web", "apps/dealer-android-app/build/outputs/apk/debug/yardimci-asistan-bayi-debug.apk"], {
    phase: 50, manual: true, domains: ["android", "web"], requires: ["image-inspector-device-build"]
  }),
  check("image-inspector-device", "Ortak fotoğraf motoru: bağlı cihazda native WebView testi", "node", ["packages/image-inspector/test/device.mjs"], {
    phase: 50, manual: true, domains: ["android"], requires: ["image-inspector-device-build"]
  }),
  check("dealer-android-tests", "Bayi Android birim testleri ve lint", "node", ["scripts/run-android-gradle.mjs", "--dealer", "--offline", "testDebugUnitTest", "lintDebug"], {
    phase: 27, domains: ["android", "commerce", "dealer-access"], requires: ["version-check"]
  }),
  check("dealer-android-build", "Bayi Android birim testleri, APK ve lint", "node", ["scripts/run-android-gradle.mjs", "--dealer", "--offline", "testDebugUnitTest", "assembleDebug", "lintDebug"], {
    phase: 27, presets: ["full"], domains: ["android", "commerce", "dealer-access"], requires: ["version-check"]
  }),
  check("android-ui-parity-v16", "Yerel Android V16 tasarım eşitliği tarayıcı kontrolü", "node", [".superdesign/android-companion/redesign-pixco-stitch-v1/test-parity-v16.cjs"], {
    phase: 50, domains: ["android", "design"]
  }),
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
  // Explicit local multi-repo audit; requires all three owner site worktrees.
  check("site-release-readiness", "Site package/version/legacy-denial local contracts", "node", ["scripts/test-site-release-readiness.mjs"], {
    phase: 5, manual: true, domains: ["web", "release"]
  }),
  check("effect-engine-consistency", "Canonical/template/Admin effect SHA-256 consistency", "node", ["--test", "scripts/test-effect-engine-sync.mjs"], {
    phase: 5, domains: ["web", "platform"]
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
    phase: 20, presets: ["full"], domains: ["platform"], requires: ["build-packages"]
  }),
  check("build-demo", "Demo site sunum derlemesi", "npm", ["run", "build:demo"], {
    phase: 21, domains: ["web"], requires: ["build-packages"]
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
  check("android-lint", "Android native lint", "node", ["scripts/run-android-gradle.mjs", "lintDebug"], {
    phase: 28, presets: ["full"], domains: ["android", "voice"], requires: ["version-check"]
  }),
  check("android-companion-device-ui", "Companion salt-okunur cihaz arayüzü", "node", ["scripts/smoke-android-device-ui.mjs", "--no-build", "--companion-only"], {
    phase: 50, presets: [], domains: ["android"], manual: true,
    requires: ["build-packages", "build-desktop", "build-android-debug"]
  }),
  check("android-companion-commerce-device-ui", "Companion sipariş detay ve karar cihaz akışı", "node", ["scripts/smoke-android-device-ui.mjs", "--no-build", "--commerce-only", "--hold-ms=900000"], {
    phase: 50, presets: [], domains: ["android", "commerce"], manual: true,
    requires: ["build-packages", "build-desktop", "build-android-debug"]
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
    requires: []
  }),
  check("package-desktop-dir", "Desktop unpacked paket üretimi", "npm", ["run", "pack:dir", "-w", "@yardimci-asistan/desktop-app"], {
    phase: 86, presets: ["release"], domains: ["desktop", "release"],
    requires: ["build-desktop", "version-check", "android-release-apk"]
  }),
  check("android-release-apk", "Android release APK", "npm", ["run", "android:release-apk"], {
    phase: 87, presets: ["release"], domains: ["android", "release"],
    requires: ["version-check"]
  }),
  check("dealer-android-release-apk", "Bayi Android kalıcı imzalı release APK", "npm", ["run", "dealer:android:release-apk"], {
    phase: 87, presets: ["release"], domains: ["android", "release"], requires: ["version-check"]
  }),
  check("release-tooling-tests", "Release paket ve toplu deploy sözleşmeleri", "node", ["--test", "scripts/test-release-artifacts.mjs"], {
    phase: 5, presets: ["full"], domains: ["platform", "release"]
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

const SETTINGS_CHECKS = new Set([
  "feature-dependencies",
  "typecheck", "typecheck-electron", "unit-tests", "version-contract-tests", "version-check", "verification-registry-tests",
  "settings-correctness", "settings-ui-correctness", "settings-platform", "workspace-platform", "sector-feature-contributions",
  "desktop-tts", "desktop-tts-ui",
  "profile-transition", "profile-transition-ui",
  "capability-runtime", "capability-settings-source", "capability-surface-consistency", "business-capabilities",
  "business-location-geocode", "business-public-profile", "setup-profile-contract", "schema-authority",
  "commerce-online-catalog", "commerce-dealer-orders", "commerce-aras-provider", "commerce-aras-ui", "business-messaging-provider", "kbs-domain"
]);
const SALES_WORKSPACE_CHECKS = new Set([
  "sales-correctness", "sales-workspace-ui", "catalog-pagination", "typecheck", "typecheck-electron", "lint-strict", "knip-strict", "design-audit-strict",
  "market-quick-sale-contract", "market-quick-sale-session", "market-sale-runtime", "market-barcode-input-contract",
  "market-live-scanner-contract", "market-product-data-contract", "commerce-product-media", "commerce-foundation", "commerce-runtime",
  "commerce-ipc-contract", "commerce-orders", "commerce-order-fulfillment", "commerce-wholesale-pricing", "commerce-wholesale-order-flow",
  "market-customer-credit-foundation", "market-customer-credit-ui-contract", "commerce-online-catalog-ui",
  "business-capabilities", "capability-runtime", "capability-surface-consistency", "market-profile-registry", "sector-feature-contributions",
  "menu-reorder-contract", "desktop-menu-db", "workspace-platform", "verification-registry-tests", "schema-authority"
]);
const PROFILE_TRANSITION_CHECKS = new Set([
  "feature-dependencies",
  "profile-transition", "profile-transition-ui", "business-capabilities", "setup-profile-contract",
  "capability-settings-source", "settings-correctness", "settings-ui-correctness", "settings-platform",
  "capability-runtime", "capability-surface-consistency", "workspace-platform", "sector-feature-contributions",
  "customer-accounts", "commerce-online-catalog", "commerce-dealer-access", "commerce-dealer-orders", "commerce-aras-provider",
  "business-messaging-provider", "kbs-domain", "market-product-data-contract", "birthday-foundation",
  "publication-protocol", "sync-publication-correctness", "marketing-website", "unit-tests",
  "typecheck", "typecheck-electron", "lint-strict", "knip-strict", "verification-registry-tests", "git-diff-check"
]);
const SALES_NAVIGATION_CHECKS = new Set([
  "sales-correctness", "sales-workspace-ui", "profile-transition-ui", "business-capabilities", "capability-runtime",
  "capability-surface-consistency", "sector-feature-contributions", "typecheck", "typecheck-electron", "verification-registry-tests"
]);
export const VERIFICATION_CHECKS = [...BASE_CHECKS, ...SMOKE_CHECKS].map(item => ({ ...item, domains: [...new Set([
  ...item.domains, ...(SETTINGS_CHECKS.has(item.id) ? ["settings"] : []), ...(SALES_WORKSPACE_CHECKS.has(item.id) ? ["sales-workspace"] : []),
  ...(PROFILE_TRANSITION_CHECKS.has(item.id) ? ["profile-transition-correctness"] : []),
  ...(SALES_NAVIGATION_CHECKS.has(item.id) ? ["sales-navigation"] : [])
])] }));

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
  if (["scripts/smoke-ai-connection-cancel-ui.mjs", "scripts/smoke-backup-zip-import-ui.mjs",
    "scripts/smoke-teknikel-shipping-repair-ui.mjs"].includes(file)) return ["build-packages"];
  if (file === "scripts/smoke-service-prerequisites.mjs" || file === "scripts/smoke-service-tiles-ui.mjs") return [];
  if (file === "scripts/smoke-companion-points-ingress.mjs") return [];
  if (file === "scripts/smoke-c19-android-fixture.mjs") return [];
  if (file === "scripts/smoke-form-image-perspective.mjs" || file === "scripts/smoke-document-output-render-snapshot.mjs") return [];
  if (file === "scripts/smoke-document-output-management.mjs" || file === "scripts/smoke-document-output.mjs" || file === "scripts/smoke-print-management-ui.mjs") return [];
  if (["scripts/smoke-market-sale-full-refund.mjs", "scripts/smoke-market-sale-full-refund-preview.mjs", "scripts/smoke-market-sale-full-refund-ui.mjs"].includes(file)) return [];
  if (file === "scripts/smoke-commerce-ipc-contract.mjs") return [];
  if (file === "scripts/smoke-commerce-order-fulfillment.mjs") return [];
  if (file === "scripts/smoke-table-order-benefits.mjs" || file === "scripts/smoke-table-order-benefits-ui.mjs") return [];
  if (file === "scripts/smoke-commerce-order-benefits.mjs") return [];
  if (file === "scripts/smoke-commerce-order-benefits-ui.mjs") return [];
  if (file === "scripts/smoke-commerce-benefits-management.mjs" || file === "scripts/smoke-commerce-benefits-management-ui.mjs") return [];
  if (file === "scripts/smoke-commerce-benefits.mjs") return [];
  if (file === "scripts/smoke-market-sale-benefits.mjs" || file === "scripts/smoke-market-sale-benefits-preview.mjs" || file === "scripts/smoke-market-sale-benefits-ui.mjs") return [];
  // Benefits/Companion source-level smokes compile current TypeScript owners; no dist build.
  if (/^scripts\/smoke-(android-(benefits-|customer-sale-preview|point-spend-quote|sale-)|companion-)/.test(file)) return [];
  if (file === "scripts/smoke-android-device-authorization-epoch.mjs" || file === "scripts/smoke-android-local-business-summary.mjs") return [];
  if (file === "scripts/smoke-local-pairing-qr.mjs") return [];
  if (file === "scripts/smoke-connection-status.mjs") return [];
  if (file === "scripts/smoke-demo-two-layer.mjs") return ["build-desktop", "build-demo", "php-lint"];
  // Copied PHP site/hosting plus isolated Desktop translation fixtures; no Demo build.
  if (file === "scripts/smoke-web-site-template.mjs") return ["build-desktop"];
  if (file === "scripts/smoke-entity-single-card.mjs") return ["build-desktop"];
  if (file === "scripts/smoke-dealer-android-device.mjs") return ["build-desktop", "php-lint"];
  // Own disposable native fixture build; does not consume the customer APK or Desktop.
  if (file === "scripts/smoke-android-native-ui-family.mjs") return [];
  if (file === "scripts/smoke-desktop-ui-family.mjs") return [];
  if (file === "scripts/smoke-market-pilot-web.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-public-translations-web.mjs") return ["build-desktop", "build-demo", "php-lint"];
  if (file.startsWith("scripts/smoke-public-translations")) return ["build-desktop"];
  if (file === "scripts/smoke-web-data-service.mjs") return [];
  // Uses its own copied PHP module plus a browser fixture; no Desktop/Demo build.
  if (file === "scripts/smoke-web-traffic-e2e.mjs") return [];
  if (file === "scripts/smoke-android-auto-repair.mjs") return ["build-packages"];
  if (file === "scripts/smoke-web-table-smoking-icons.mjs") return [];
  if (file === "scripts/smoke-android-kbs-hosting.mjs") return ["php-lint"];
  if (file === "scripts/smoke-voice-stt-android.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-voice-stt-desktop.mjs") return [];
  if (file === "scripts/smoke-voice-stt-provider.php") return ["php-lint"];
  if (file === "scripts/smoke-voice-stt-hosting.mjs" || file === "scripts/smoke-voice-stt-publication.mjs") return ["build-packages", "php-lint"];
  if (file === "scripts/smoke-desktop-tts.mjs") return [];
  if (file === "scripts/smoke-android-companion-v3.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-publication-protocol.mjs" || file === "scripts/smoke-sync-publication-correctness.mjs"
      || file === "scripts/smoke-windows-demo-restore.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-nexa-assets.mjs") return [];
  if (["scripts/smoke-web-nexa.mjs", "scripts/smoke-web-widget-branding.mjs", "scripts/smoke-web-widget-module.mjs"].includes(file)) return ["build-demo"];
  if (file === "scripts/smoke-marketing-log-privacy.mjs") return ["php-lint"];
  if (file === "scripts/smoke-instagram-staging.mjs" || file === "scripts/smoke-instagram-oauth-web.mjs") return ["php-lint"];
  if (file === "scripts/smoke-showcase-website.mjs" || file === "scripts/smoke-marketing-website.mjs") return ["build-desktop", "build-demo", "php-lint"];
  if (file === "scripts/smoke-business-messaging-hosting.mjs" || file === "scripts/smoke-business-messaging-webhook.php") return ["php-lint"];
  if (file === "scripts/smoke-customer-accounts.mjs") return ["build-desktop", "php-lint"];
  if (file === "scripts/smoke-dealer-applications.mjs") return ["build-desktop", "build-demo", "php-lint"];
  if (file === "scripts/smoke-web-dealer-portal.mjs" || file === "scripts/smoke-commerce-dealer-orders.mjs") return ["build-desktop", "build-demo", "php-lint"];
  if (file === "scripts/smoke-web-storefront.mjs") return ["build-demo", "php-lint"];
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
  if (/^scripts\/smoke-(ai-connection-cancel|backup-zip-import|teknikel-shipping-repair)(-ui)?\.mjs$/.test(file)) return ["desktop", "settings"];
  if (file === "scripts/smoke-service-prerequisites.mjs" || file === "scripts/smoke-service-tiles-ui.mjs") return ["desktop", "settings"];
  if (file === "scripts/smoke-print-management-ui.mjs") return ["desktop", "settings"];
  if (file === "scripts/smoke-table-order-benefits.mjs" || file === "scripts/smoke-table-order-benefits-ui.mjs") return ["desktop", "hospitality", "commerce", "finance", "customers"];
  if (file === "scripts/smoke-demo-two-layer.mjs") return ["web", "translations", "commerce"];
  if (file.startsWith("scripts/smoke-product-photos")) return ["desktop", "commerce", "web", "product-identity"];
  if (file === "scripts/smoke-entity-single-card.mjs") return ["desktop", "commerce", "customers", "hospitality"];
  if (file.startsWith("scripts/smoke-data-transfer")) return ["desktop", "customers", "commerce", "product-identity"];
  if (file.startsWith("scripts/smoke-public-translations")) return ["translations", "settings", "web", "desktop"];
  if (file === "scripts/smoke-android-auto-repair.mjs") return ["android", "desktop", "settings"];
  if (file === "scripts/smoke-android-kbs.mjs") return ["android", "hospitality", "desktop"];
  if (file === "scripts/smoke-android-kbs-hosting.mjs") return ["android", "hospitality", "web"];
  if (file === "scripts/smoke-voice-stt-android.mjs") return ["voice", "android", "settings", "web"];
  const name = file.replace(/^scripts\/smoke-/, "").replace(/\.(mjs|php)$/, "");
  const productIdentityChecks = new Set([
    "menu-product-identity", "desktop-menu-db", "menu-reorder-contract", "schema-authority", "storage-correctness",
    "domain-mutation-ownership", "room-folio-service", "room-folio-table-order-transfer", "finance-source-ownership",
    "record-deletions", "reports-db", "automatic-sync", "commerce-foundation", "commerce-online-catalog",
    "commerce-product-media", "commerce-ipc-contract", "commerce-runtime", "sales-correctness",
    "market-android-foundation", "android-permission-matrix", "stock-image-import-db", "stock-image-analysis",
    "web-module-menu", "business-capabilities", "workspace-platform", "capability-surface-consistency",
    "desktop-renderer", "local-companion-server", "publication-protocol", "sync-publication-correctness",
    "hospitality-domain", "hospitality-guests", "table-customer", "android-hosting-contract", "android-device-approval-hosting"
  ]);
  if (productIdentityChecks.has(name)) return [...smokeDomainsForGeneralOwnership(file), "product-identity"];
  return smokeDomainsForGeneralOwnership(file);
}

function smokeDomainsForGeneralOwnership(file) {
  if (file === "scripts/smoke-connection-status.mjs") return ["desktop", "web", "platform"];
  if (file === "scripts/smoke-web-traffic-e2e.mjs") return ["web", "platform"];
  if (file === "scripts/smoke-desktop-visible-updater.mjs") return ["desktop", "settings", "platform"];
  if (file.includes("desktop-tts")) return ["voice", "settings", "desktop", "platform"];
  if (file.includes("voice-stt")) return ["voice", "settings", "web", "platform"];
  const name = file.replace(/^scripts\/smoke-/, "").replace(/\.(mjs|php)$/, "");
  if (name === "catalog-pagination") return ["desktop", "commerce"];
  if (name === "record-picker-ui") return ["desktop", "commerce", "customers", "platform"];
  if (name === "android-companion-v3") return ["android", "commerce", "marketing", "web", "platform"];
  if (name === "market-sale-finance") return ["commerce", "finance", "android"];
  if (name === "publication-protocol") return ["web", "android", "commerce", "marketing", "platform"];
  if (name === "sync-publication-correctness") return ["web", "android", "platform"];

  if (name === "nexa-assets") return ["desktop", "web", "platform"];
  if (name === "storage-correctness") return ["hospitality", "finance", "web", "platform"];
  if (name === "schema-authority") return ["platform", "hospitality", "finance", "customers", "web"];
  if (name === "domain-mutation-ownership") return ["commerce", "hospitality", "finance", "android", "customers"];
  if (/^runtime-boundary-/.test(name)) return ["platform", "desktop", "hospitality", "finance", "customers", "android"];
  if (name === "runtime-application-operations") return ["platform", "desktop", "hospitality", "finance", "commerce"];
  const domains = new Set();
  if (/^(companion-(benefits|coupon|points)|android-(benefits-|customer-sale-preview|point-spend-quote|sale-))/.test(name)) {
    domains.add("android");
    domains.add("commerce");
    domains.add("customers");
    if (/sale|refund|finance/.test(name)) domains.add("finance");
  }
  if (/marketing-|showcase-|instagram-/.test(name)) domains.add("marketing");
  if (name === "marketing-log-privacy") domains.add("diagnostics");
  if (/messaging-dispatch/.test(name)) { domains.add("messaging-dispatch"); domains.add("business-messaging"); domains.add("customers"); domains.add("platform"); }
  if (/messaging-campaigns/.test(name)) { domains.add("messaging-campaigns"); domains.add("business-messaging"); domains.add("customers"); domains.add("platform"); }
  if (/customer-accounts|dealer-access|dealer-portal|dealer-applications|wholesale-customer-ui\.mjs/.test(file)) domains.add("dealer-access");

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
  if (name === "local-pairing-qr") { domains.add("android"); domains.add("settings"); }
  if (name === "local-companion-server" || name === "local-companion-tls" || name === "local-pairing-security") {
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
