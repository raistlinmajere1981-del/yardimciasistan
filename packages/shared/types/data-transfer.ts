/** Pure transfer preferences and column labels shared by Desktop UI and its backend. */
export interface TransferPreferences {
  conflicts: "skip" | "update";
  activate: boolean;
  publish: boolean;
  menuCategoryId: string;
  applyStock: boolean;
  missingImages: "without" | "skip";
  fallbackCategory: boolean;
}
export const DEFAULT_TRANSFER_PREFERENCES: TransferPreferences = {
  conflicts: "skip", activate: false, publish: false, menuCategoryId: "", applyStock: false,
  missingImages: "without", fallbackCategory: true
};
export const PRODUCT_TRANSFER_FIELDS: Record<string, string> = {
  id: "Uygulama kimliği", name: "Ürün adı", category: "Kategori", categoryPath: "Kategori yolu", brand: "Marka", sku: "Stok kodu", barcode: "Barkod", description: "Açıklama",
  currency: "Para birimi", unit: "Birim", taxRate: "KDV oranı", salePrice: "Perakende fiyatı (brüt)", purchasePrice: "Alış fiyatı",
  dealerPriceA: "Bayi A fiyatı", dealerPriceB: "Bayi B fiyatı", onlineSalesPublished: "Webde yayınla", trackInventory: "Stok takibi",
  minimumQuantity: "Minimum miktar", stockQuantity: "Mevcut stok", image: "Görsel", sourceId: "Kaynak kimliği", sourceProductUrl: "Kaynak URL", imageSourceUrl: "Görsel URL",
  menuCategory: "Menü kategorisi", menuPriceOverride: "Menü fiyatı", allergens: "Alerjenler", tags: "Etiketler", menuAvailable: "Menüde mevcut", menuFeatured: "Öne çıkan", menuHideOutOfStock: "Stok yokken gizle", menuConsumption: "Menü stok tüketimi", menuSortOrder: "Menü sırası"
};
export const CUSTOMER_TRANSFER_FIELDS: Record<string, string> = {
  id: "Uygulama kimliği", fullName: "Müşteri adı", phone: "Telefon", email: "E-posta", companyName: "Firma", taxOffice: "Vergi dairesi", taxNumber: "Vergi numarası",
  authorizedPerson: "Yetkili kişi", dealerStatus: "Bayi durumu", priceGroup: "Fiyat grubu", paymentTermDays: "Vade günü", commercialNotes: "Ticari not",
  address: "Adres", notes: "Not", tags: "Etiketler", identityType: "Kimlik türü", identityNumber: "Kimlik numarası", birthDate: "Doğum tarihi", nationality: "Uyruk",
  gender: "Cinsiyet", documentSerialNumber: "Belge seri numarası", documentExpiryDate: "Belge geçerlilik tarihi", birthPlace: "Doğum yeri", motherName: "Anne adı", fatherName: "Baba adı", issuingAuthority: "Belgeyi veren makam"
};
export const IDENTITY_TRANSFER_FIELDS = ["identityType", "identityNumber", "birthDate", "nationality", "gender", "documentSerialNumber", "documentExpiryDate", "birthPlace", "motherName", "fatherName", "issuingAuthority"];
