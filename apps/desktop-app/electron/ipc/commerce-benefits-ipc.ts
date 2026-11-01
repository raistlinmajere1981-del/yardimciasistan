import { app, ipcMain, safeStorage } from "electron";
import type { BenefitsManagementBridge, BenefitsManagementResult } from "@yardimci-asistan/shared";
import type { DesktopDatabase } from "../database";
import { CommerceBenefitsKey } from "../commerce-benefits-key";
import { benefitsAssert, CommerceBenefitsError } from "../commerce-benefits-engine";

const messages: Record<string, string> = {
  BENEFITS_STAFF_REQUIRED: "Bu işlem yalnız yetkili masaüstü penceresinden yapılabilir.",
  BENEFITS_SESSION_LOCKED: "Devam etmek için uygulama kilidini açın.",
  BENEFITS_CAPABILITY_DISABLED: "İndirim ve Puan bu işletmede etkin değil.",
  BENEFITS_RULE_VERSION_CONFLICT: "Kural değişti. Listeyi yenileyip tekrar düzenleyin.",
  BENEFITS_SETTINGS_VERSION_CONFLICT: "Ayarlar değişti. Listeyi yenileyip tekrar deneyin.",
  BENEFITS_SECURE_STORAGE_UNAVAILABLE: "Güvenli anahtar saklama kullanılamıyor. Kupon ve Puan hareketi oluşturulamadı.",
  BENEFITS_POINTS_INSUFFICIENT: "Kullanılabilir Puan bu işlem için yetersiz.",
  BENEFITS_POINTS_UNAVAILABLE: "Önce Puan ailesini etkinleştirin.",
  BENEFITS_COUPON_UNAVAILABLE: "Kupon kullanılamıyor. Kodu ve kupon koşullarını kontrol edin.",
  BENEFITS_COUPON_RATE_LIMITED: "Çok fazla kupon denemesi yapıldı. Bir dakika sonra tekrar deneyin.",
  BENEFITS_COUPON_AUTHORIZATION_REQUIRED: "Kupon önizlemesini yenileyin.",
  BENEFITS_COUPON_THRESHOLD: "Sepet kuponun asgari tutar koşulunu karşılamıyor.",
  BENEFITS_COUPON_EXHAUSTED: "Kuponun kullanım hakkı kalmadı.",
  BENEFITS_QUOTE_CHANGED: "Tutar veya kurallar değişti. Önizlemeyi yenileyip yeniden onaylayın.",
  BENEFITS_PAYMENT_METHOD_CHANGED: "Ödeme yöntemi değişti. Önizlemeyi yenileyin.",
  BENEFITS_FAST_SALE_UNSUPPORTED: "İndirim ve Puan için manuel indirimi kaldırın ve satışın tamamını ödeyin.",
  BENEFITS_ACTUAL_PAYMENT_REQUIRED: "Ödeme tutarı güncel önizleme ile aynı olmalı.",
  BENEFITS_TABLE_MANUAL_DISCOUNT_UNSUPPORTED: "Manuel masa indirimiyle İndirim ve Puan birlikte kullanılamıyor. Mevcut indirim korunuyor.",
  BENEFITS_TABLE_SNAPSHOT_CONFLICT: "Adisyon satırları veya toplamı tutarsız. Adisyonu kontrol edip önizlemeyi yenileyin.",
  BENEFITS_TABLE_PAID_REQUIRED: "İndirim ve Puan yalnız açık, pozitif tutarlı adisyonun gerçek tahsilatında kullanılabilir.",
  BENEFITS_SETTLEMENT_MISMATCH: "Tahsilat kanıtı adisyonla eşleşmedi. İşlem geri alındı.",
  BENEFITS_ORDER_SNAPSHOT_CONFLICT: "İndirim hesabı kayıtlı sipariş toplamıyla uyuşmuyor. Sipariş tutarı değiştirilemez; İndirim ve Puan uygulanamadı.",
  BENEFITS_ORDER_PAID_REQUIRED: "İndirim ve Puan yalnız onaylanmış siparişin tam ödenmiş tamamlanmasında kullanılabilir.",
  BENEFITS_ORDER_SOURCE_UNSUPPORTED: "Bu sipariş kaynağında İndirim ve Puan henüz kullanılamıyor.",
  BENEFITS_COMBINATION_FORBIDDEN: "Seçilen kupon, ödeme yöntemi ve Puan birlikte kullanılamıyor.",
  BENEFITS_CUSTOMER_SCOPE: "Müşteri bu işletmede bulunamadı.",
  BENEFITS_ADJUSTMENT_REASON_REQUIRED: "En az üç karakterlik işlem gerekçesi girin.",
  BENEFITS_IDEMPOTENCY_INTENT_CHANGED: "Bu işlem anahtarı farklı bir işlemde kullanılmış.",
};
export function benefitsManagementFailure(error: unknown): Extract<BenefitsManagementResult<never>, { ok: false }> {
  const code = error instanceof CommerceBenefitsError ? error.code : "BENEFITS_MANAGEMENT_FAILED";
  return { ok: false, code: code in messages ? code : "BENEFITS_INVALID_INPUT",
    message: messages[code] ?? "İşlem tamamlanamadı. Alanları kontrol edip tekrar deneyin." };
}
/** Shared with focused tests; protects ALL B1 channels before touching the database/key. */
export function assertBenefitsManagementSender(event: Electron.IpcMainInvokeEvent, options: {
  assertUnlocked(): void; isTrustedRendererUrl(url: string): boolean;
}): void {
  benefitsAssert(event.sender.getType() === "window" && event.senderFrame && event.senderFrame === event.sender.mainFrame
    && options.isTrustedRendererUrl(event.senderFrame.url), "BENEFITS_STAFF_REQUIRED");
  try { options.assertUnlocked(); } catch { throw new CommerceBenefitsError("BENEFITS_SESSION_LOCKED"); }
}
export function registerCommerceBenefitsIpcHandlers(options: {
  getDatabase(): DesktopDatabase; assertUnlocked(): void; isTrustedRendererUrl(url: string): boolean;
}) {
  const keys = new CommerceBenefitsKey(app.getPath("userData"), safeStorage);
  function register<K extends keyof BenefitsManagementBridge>(channel: string, method: K) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      try {
        const assertAuthorized = () => assertBenefitsManagementSender(event, options);
        assertAuthorized();
        const service = options.getDatabase().commerceBenefitsManagement(keys, { id: "local-desktop-owner", role: "desktop_owner", assertAuthorized });
        const calls = {
          getCommerceBenefits: () => service.snapshot(),
          configureCommerceBenefits: () => service.configure(args[0] as Parameters<BenefitsManagementBridge["configureCommerceBenefits"]>[0]),
          saveCommerceBenefitsRule: () => service.saveRule(args[0]),
          issueCommerceBenefitsCoupon: () => service.issueCoupon(args[0] as Parameters<BenefitsManagementBridge["issueCommerceBenefitsCoupon"]>[0]),
          getCommercePointAccount: () => service.pointAccount(args[0] as string, args[1] as string),
          adjustCommercePoints: () => service.adjustPoints(args[0] as Parameters<BenefitsManagementBridge["adjustCommercePoints"]>[0]),
          expireCommercePoints: () => service.expirePoints(args[0] as Parameters<BenefitsManagementBridge["expireCommercePoints"]>[0]),
          getCompanionPointGrantStatus: () => service.companionPointGrantStatus(args[0] as Parameters<BenefitsManagementBridge["getCompanionPointGrantStatus"]>[0]),
          getCompanionPointSpendStatus: () => service.companionPointSpendGrantStatus(args[0] as Parameters<BenefitsManagementBridge["getCompanionPointSpendStatus"]>[0]),
          grantCompanionPointSpend: () => service.changeCompanionPointSpendGrant(args[0] as Parameters<BenefitsManagementBridge["grantCompanionPointSpend"]>[0], true),
          revokeCompanionPointSpend: () => service.changeCompanionPointSpendGrant(args[0] as Parameters<BenefitsManagementBridge["revokeCompanionPointSpend"]>[0], false),
          listCompanionPointDevices: () => service.companionPointDevices(),
          grantCompanionPointAccess: () => service.changeCompanionPointGrant(args[0] as Parameters<BenefitsManagementBridge["grantCompanionPointAccess"]>[0], true),
          revokeCompanionPointAccess: () => service.changeCompanionPointGrant(args[0] as Parameters<BenefitsManagementBridge["revokeCompanionPointAccess"]>[0], false),
        };
        return { ok: true, value: calls[method]() };
      } catch (error) {
        // Never throw provider/SQLite/renderer error strings into the global IPC logger.
        // The result contains only a fixed safe catalog, never request arguments or secrets.
        return benefitsManagementFailure(error);
      }
    });
  }
  register("benefits:get", "getCommerceBenefits");
  register("benefits:configure", "configureCommerceBenefits");
  register("benefits:saveRule", "saveCommerceBenefitsRule");
  register("benefits:issueCoupon", "issueCommerceBenefitsCoupon");
  register("benefits:pointAccount", "getCommercePointAccount");
  register("benefits:adjustPoints", "adjustCommercePoints");
  register("benefits:expirePoints", "expireCommercePoints");
  register("benefits:companionGrantStatus", "getCompanionPointGrantStatus");
  register("benefits:companionSpendStatus", "getCompanionPointSpendStatus");
  register("benefits:companionSpendGrant", "grantCompanionPointSpend");
  register("benefits:companionSpendRevoke", "revokeCompanionPointSpend");
  register("benefits:companionDevices", "listCompanionPointDevices");
  register("benefits:companionGrant", "grantCompanionPointAccess");
  register("benefits:companionRevoke", "revokeCompanionPointAccess");
}
