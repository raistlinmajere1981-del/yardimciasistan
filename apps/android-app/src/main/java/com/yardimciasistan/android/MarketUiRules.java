package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

/**
 * Pure Market companion rules shared by the Android views and JVM tests.
 *
 * <p>The phone only prepares Market action payloads. Inventory deltas, sales,
 * payments, and purchase-order workflows remain desktop concerns.</p>
 */
final class MarketUiRules {
  static final String CAPABILITY_CATALOG = "commerce.catalog";
  static final String CAPABILITY_INVENTORY = "commerce.inventory";
  static final String CAPABILITY_SALES = "commerce.sales";
  static final String CAPABILITY_BARCODE = "retail.barcode";
  static final String CAPABILITY_PURCHASING = "retail.purchasing";
  static final String CAPABILITY_SUPPLIERS = "retail.suppliers";
  static final String CAPABILITY_LABELS = "retail.labels";

  static final String PERMISSION_SUMMARY = "market.summary.view";
  static final String PERMISSION_PRODUCT_VIEW = "market.product.view";
  static final String PERMISSION_STOCK_COUNT = "market.stock_count";
  static final String PERMISSION_RECEIVING = "market.receiving";
  static final String PERMISSION_PRODUCT_DRAFT = "market.product_draft";
  static final String PERMISSION_CART_DRAFT = "market.cart_draft";
  static final String PERMISSION_SCAN_TO_DESKTOP = "market.scan_to_desktop";

  static final String ACTION_STOCK_COUNT = "market_stock_count";
  static final String ACTION_PURCHASE_RECEIVE = "market_purchase_receive";
  static final String ACTION_PRODUCT_DRAFT_CREATE = "market_product_draft_create";
  static final String ACTION_CART_DRAFT_CREATE = "market_cart_draft_create";
  static final String ACTION_BARCODE_SCAN = "market_barcode_scan";
  static final long BARCODE_DEBOUNCE_MS = 1_000L;

  private static final String[] MARKET_PERMISSIONS = {
      PERMISSION_SUMMARY,
      PERMISSION_PRODUCT_VIEW,
      PERMISSION_STOCK_COUNT,
      PERMISSION_RECEIVING,
      PERMISSION_PRODUCT_DRAFT,
      PERMISSION_CART_DRAFT,
      PERMISSION_SCAN_TO_DESKTOP
  };

  private MarketUiRules() {}

  static boolean hasRetailWorkspaceCapability(OperationData data) {
    return data != null && (
        data.hasBusinessCapability(CAPABILITY_BARCODE)
            || data.hasBusinessCapability(CAPABILITY_PURCHASING)
            || data.hasBusinessCapability(CAPABILITY_SUPPLIERS)
            || data.hasBusinessCapability(CAPABILITY_LABELS)
    );
  }

  static boolean canOpenMarket(OperationData data) {
    if (data == null
        || !data.hasBusinessCapability(AndroidUiRules.CAPABILITY_ANDROID)
        || !hasRetailWorkspaceCapability(data)) {
      return false;
    }
    for (String permission : MARKET_PERMISSIONS) {
      if (data.hasPermission(permission)) {
        return true;
      }
    }
    return false;
  }

  static boolean canViewSummary(OperationData data) {
    return canOpenMarket(data) && data.hasPermission(PERMISSION_SUMMARY);
  }

  static boolean canViewProducts(OperationData data) {
    return canOpenMarket(data) && data.hasPermission(PERMISSION_PRODUCT_VIEW);
  }

  static boolean canScanBarcode(OperationData data) {
    return canViewProducts(data) && data.hasBusinessCapability(CAPABILITY_BARCODE);
  }

  static boolean canStockCount(OperationData data) {
    return canViewProducts(data) && data.hasPermission(PERMISSION_STOCK_COUNT);
  }

  static boolean canReceive(OperationData data) {
    return canViewProducts(data) && data.hasPermission(PERMISSION_RECEIVING);
  }

  static boolean canCreateProductDraft(OperationData data) {
    return canOpenMarket(data) && data.hasPermission(PERMISSION_PRODUCT_DRAFT);
  }

  static boolean canCreateCartDraft(OperationData data) {
    return canViewProducts(data) && data.hasPermission(PERMISSION_CART_DRAFT);
  }

  static boolean canScanToDesktop(OperationData data) {
    return canOpenMarket(data)
        && data.hasPermission(PERMISSION_SCAN_TO_DESKTOP)
        && data.hasBusinessCapability(CAPABILITY_CATALOG)
        && data.hasBusinessCapability(CAPABILITY_SALES)
        && data.hasBusinessCapability(CAPABILITY_BARCODE);
  }

  static String requiredPermissionForAction(String actionType) {
    if (ACTION_STOCK_COUNT.equals(actionType)) return PERMISSION_STOCK_COUNT;
    if (ACTION_PURCHASE_RECEIVE.equals(actionType)) return PERMISSION_RECEIVING;
    if (ACTION_PRODUCT_DRAFT_CREATE.equals(actionType)) return PERMISSION_PRODUCT_DRAFT;
    if (ACTION_CART_DRAFT_CREATE.equals(actionType)) return PERMISSION_CART_DRAFT;
    if (ACTION_BARCODE_SCAN.equals(actionType)) return PERMISSION_SCAN_TO_DESKTOP;
    return null;
  }

  static JSONObject barcodeScanPayload(String rawBarcode, String scannedAt)
      throws ValidationException {
    String barcode = limitedText(rawBarcode, 120, "Barkod");
    if (barcode.length() < 3) throw new ValidationException("Geçerli bir barkod girin.");
    String timestamp = limitedText(scannedAt, 80, "Tarama zamanı");
    if (timestamp.isEmpty()) throw new ValidationException("Tarama zamanı gerekli.");
    try {
      return new JSONObject()
          .put("barcode", barcode)
          .put("scanned_at", timestamp);
    } catch (Exception error) {
      throw new ValidationException("Barkod taraması hazırlanamadı.");
    }
  }

  static String pendingStatus(int localPendingCount, int desktopPendingCount) {
    if (localPendingCount > 0) {
      return "Gönderim bekliyor · " + localPendingCount + " işlem telefonda";
    }
    if (desktopPendingCount > 0) {
      return "Masaüstü uygulaması bekleniyor · " + desktopPendingCount + " işlem";
    }
    return "";
  }

  static OperationData.MarketProduct resolveBarcode(OperationData data, String rawBarcode) {
    if (!canViewProducts(data)) return null;
    String barcode = text(rawBarcode);
    if (barcode.isEmpty()) return null;
    for (OperationData.MarketProduct product : data.market.products) {
      if (product.active && barcode.equals(product.barcode.trim())) {
        return product;
      }
    }
    return null;
  }

  static OperationData.MarketProduct productById(OperationData data, String productId) {
    if (data == null || data.market == null) return null;
    String expected = text(productId);
    for (OperationData.MarketProduct product : data.market.products) {
      if (product.active && expected.equals(product.id)) return product;
    }
    return null;
  }

  static List<OperationData.MarketProduct> searchProducts(OperationData data, String rawQuery) {
    ArrayList<OperationData.MarketProduct> matches = new ArrayList<>();
    if (!canViewProducts(data)) return matches;
    String query = text(rawQuery).toLowerCase(new Locale("tr", "TR"));
    for (OperationData.MarketProduct product : data.market.products) {
      if (!product.active) continue;
      if (query.isEmpty()
          || product.name.toLowerCase(new Locale("tr", "TR")).contains(query)
          || product.sku.toLowerCase(Locale.ROOT).contains(query)
          || product.barcode.toLowerCase(Locale.ROOT).contains(query)) {
        matches.add(product);
      }
      if (matches.size() >= 80) break;
    }
    return matches;
  }

  static JSONObject stockCountPayload(
      OperationData.MarketProduct product,
      String rawCountedQuantity,
      String note
  ) throws ValidationException {
    if (product == null || !product.active || !product.trackInventory || text(product.id).isEmpty()) {
      throw new ValidationException("Stok takibine açık bir ürün seçin.");
    }
    double countedQuantity = parseNumber(rawCountedQuantity, true, "Fiziksel miktar");
    JSONObject payload = new JSONObject();
    try {
      payload.put("product_id", product.id);
      // This is deliberately absolute. The desktop runtime owns delta calculation.
      payload.put("counted_quantity", countedQuantity);
      payload.put("expected_updated_at", text(product.inventoryUpdatedAt));
      payload.put("note", limitedText(note, 2000, "Not"));
      return payload;
    } catch (ValidationException error) {
      throw error;
    } catch (Exception error) {
      throw new ValidationException("Stok sayımı hazırlanamadı.");
    }
  }

  static JSONObject productDraftPayload(
      String barcode,
      String proposedName,
      String sku,
      String unit,
      String rawPurchasePrice,
      String rawSalePrice,
      String category,
      String note
  ) throws ValidationException {
    String normalizedBarcode = limitedText(barcode, 120, "Barkod");
    if (normalizedBarcode.length() < 3) {
      throw new ValidationException("Geçerli bir barkod girin.");
    }
    String normalizedName = limitedText(proposedName, 240, "Ürün adı");
    if (normalizedName.isEmpty()) {
      throw new ValidationException("Ürün adı gerekli.");
    }
    String normalizedUnit = text(unit);
    if (!isUnit(normalizedUnit)) {
      throw new ValidationException("Geçerli bir birim seçin.");
    }
    double purchasePrice = optionalMoney(rawPurchasePrice, "Alış fiyatı");
    double salePrice = optionalMoney(rawSalePrice, "Satış fiyatı");
    try {
      JSONObject payload = new JSONObject();
      payload.put("barcode", normalizedBarcode);
      payload.put("proposed_name", normalizedName);
      payload.put("sku", limitedText(sku, 120, "SKU"));
      payload.put("unit", normalizedUnit);
      payload.put("proposed_purchase_price", purchasePrice);
      payload.put("proposed_sale_price", salePrice);
      payload.put("proposed_category", limitedText(category, 180, "Kategori"));
      payload.put("currency", "TRY");
      payload.put("note", limitedText(note, 2000, "Not"));
      return payload;
    } catch (ValidationException error) {
      throw error;
    } catch (Exception error) {
      throw new ValidationException("Ürün taslağı hazırlanamadı.");
    }
  }

  static boolean isUnit(String unit) {
    String value = text(unit);
    return "piece".equals(value)
        || "kg".equals(value)
        || "g".equals(value)
        || "l".equals(value)
        || "ml".equals(value)
        || "pack".equals(value)
        || "box".equals(value)
        || "meter".equals(value)
        || "other".equals(value);
  }

  static double parsePositiveQuantity(String raw, String label) throws ValidationException {
    return parseNumber(raw, false, label);
  }

  static double parseUnitCost(String raw) throws ValidationException {
    return parseNumber(raw, true, "Birim alış fiyatı");
  }

  private static double optionalMoney(String raw, String label) throws ValidationException {
    if (text(raw).isEmpty()) return 0;
    return parseNumber(raw, true, label);
  }

  private static double parseNumber(String raw, boolean allowZero, String label) throws ValidationException {
    String normalized = text(raw).replace(" ", "").replace(',', '.');
    if (normalized.isEmpty()) throw new ValidationException(label + " gerekli.");
    try {
      double value = Double.parseDouble(normalized);
      if (!Double.isFinite(value) || value < 0 || (!allowZero && value == 0) || value > 100_000_000d) {
        throw new ValidationException(label + (allowZero ? " 0 veya daha büyük olmalı." : " sıfırdan büyük olmalı."));
      }
      return round(value, 4);
    } catch (NumberFormatException error) {
      throw new ValidationException(label + " geçersiz.");
    }
  }

  private static String limitedText(String raw, int maximum, String label) throws ValidationException {
    String value = text(raw).replaceAll("\\s+", " ");
    if (value.length() > maximum) {
      throw new ValidationException(label + " en fazla " + maximum + " karakter olabilir.");
    }
    if (value.matches(".*[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F].*")) {
      throw new ValidationException(label + " geçersiz karakter içeriyor.");
    }
    return value;
  }

  private static String text(String value) {
    return value == null ? "" : value.trim();
  }

  private static double round(double value, int decimals) {
    double factor = Math.pow(10, decimals);
    return Math.round((value + Math.ulp(value)) * factor) / factor;
  }

  static final class BarcodeDebouncer {
    private final long debounceMs;
    private String lastBarcode = "";
    private long lastAcceptedAt = Long.MIN_VALUE;

    BarcodeDebouncer(long debounceMs) {
      this.debounceMs = Math.max(0L, debounceMs);
    }

    boolean accept(String rawBarcode, long nowMs) {
      String barcode = text(rawBarcode);
      if (barcode.isEmpty()) return false;
      boolean sameWithinWindow = barcode.equals(lastBarcode)
          && lastAcceptedAt != Long.MIN_VALUE
          && nowMs >= lastAcceptedAt
          && nowMs - lastAcceptedAt < debounceMs;
      if (sameWithinWindow) return false;
      lastBarcode = barcode;
      lastAcceptedAt = nowMs;
      return true;
    }
  }

  static final class BarcodeScanCapture {
    private final BarcodeDebouncer debouncer;

    BarcodeScanCapture(long debounceMs) {
      debouncer = new BarcodeDebouncer(debounceMs);
    }

    JSONObject capture(String rawBarcode, long nowMs, String scannedAt)
        throws ValidationException {
      String barcode = text(rawBarcode);
      if (!debouncer.accept(barcode, nowMs)) return null;
      return barcodeScanPayload(barcode, scannedAt);
    }
  }

  static final class CartDraft {
    private final LinkedHashMap<String, CartLine> lines = new LinkedHashMap<>();
    String note = "";

    void addProduct(OperationData.MarketProduct product) throws ValidationException {
      if (product == null || !product.active || text(product.id).isEmpty()) {
        throw new ValidationException("Aktif bir ürün seçin.");
      }
      CartLine existing = lines.get(product.id);
      if (existing == null) {
        lines.put(product.id, new CartLine(
            product.id,
            product.name,
            product.salePrice,
            product.currency,
            product.unit,
            1
        ));
      } else {
        existing.quantity = round(existing.quantity + 1, 4);
      }
    }

    void changeQuantity(String productId, double delta) {
      CartLine line = lines.get(productId);
      if (line == null || !Double.isFinite(delta)) return;
      double next = round(line.quantity + delta, 4);
      if (next <= 0) {
        lines.remove(productId);
      } else {
        line.quantity = next;
      }
    }

    void remove(String productId) {
      lines.remove(productId);
    }

    int size() {
      return lines.size();
    }

    List<CartLine> lines() {
      return new ArrayList<>(lines.values());
    }

    double estimatedTotal() {
      double total = 0;
      for (CartLine line : lines.values()) {
        total += line.quantity * line.unitPrice;
      }
      return round(total, 2);
    }

    JSONObject toPayload() throws ValidationException {
      if (lines.isEmpty()) throw new ValidationException("Sepete en az bir ürün ekleyin.");
      if (lines.size() > 200) throw new ValidationException("Sepet en fazla 200 ürün satırı içerebilir.");
      JSONArray serializedLines = new JSONArray();
      try {
        for (CartLine line : lines.values()) {
          if (!Double.isFinite(line.quantity) || line.quantity <= 0) {
            throw new ValidationException("Sepet miktarları sıfırdan büyük olmalı.");
          }
          JSONObject serialized = new JSONObject();
          serialized.put("product_id", line.productId);
          serialized.put("quantity", line.quantity);
          serializedLines.put(serialized);
        }
        JSONObject payload = new JSONObject();
        payload.put("lines", serializedLines);
        payload.put("note", limitedText(note, 2000, "Not"));
        return payload;
      } catch (ValidationException error) {
        throw error;
      } catch (Exception error) {
        throw new ValidationException("Sepet taslağı hazırlanamadı.");
      }
    }

    void clear() {
      lines.clear();
      note = "";
    }
  }

  static final class CartLine {
    final String productId;
    final String productName;
    final double unitPrice;
    final String currency;
    final String unit;
    double quantity;

    CartLine(
        String productId,
        String productName,
        double unitPrice,
        String currency,
        String unit,
        double quantity
    ) {
      this.productId = productId;
      this.productName = productName;
      this.unitPrice = Math.max(0, unitPrice);
      this.currency = text(currency).isEmpty() ? "TRY" : text(currency);
      this.unit = text(unit).isEmpty() ? "piece" : text(unit);
      this.quantity = quantity;
    }
  }

  static final class ReceivingDraft {
    private final LinkedHashMap<String, ReceivingLine> lines = new LinkedHashMap<>();
    String supplierId = "";
    String note = "";

    void putProduct(OperationData.MarketProduct product, String rawQuantity, String rawUnitCost)
        throws ValidationException {
      if (product == null || !product.active || !product.trackInventory || text(product.id).isEmpty()) {
        throw new ValidationException("Stok takibine açık bir ürün seçin.");
      }
      double quantity = parsePositiveQuantity(rawQuantity, "Miktar");
      double unitCost = parseUnitCost(rawUnitCost);
      String currency = text(product.currency).isEmpty() ? "TRY" : text(product.currency);
      for (ReceivingLine existing : lines.values()) {
        if (!existing.productId.equals(product.id) && !existing.currency.equals(currency)) {
          throw new ValidationException("Tek mal kabulünde ürün para birimleri aynı olmalı.");
        }
      }
      lines.put(product.id, new ReceivingLine(
          product.id,
          product.name,
          quantity,
          round(unitCost, 2),
          currency
      ));
    }

    ReceivingLine line(String productId) {
      return lines.get(productId);
    }

    void remove(String productId) {
      lines.remove(productId);
    }

    int size() {
      return lines.size();
    }

    List<ReceivingLine> lines() {
      return new ArrayList<>(lines.values());
    }

    double total() {
      double total = 0;
      for (ReceivingLine line : lines.values()) {
        total += line.quantity * line.unitCost;
      }
      return round(total, 2);
    }

    JSONObject toPayload() throws ValidationException {
      if (lines.isEmpty()) throw new ValidationException("Mal kabulüne en az bir ürün ekleyin.");
      JSONArray serializedLines = new JSONArray();
      try {
        for (ReceivingLine line : lines.values()) {
          if (!Double.isFinite(line.quantity) || line.quantity <= 0) {
            throw new ValidationException("Mal kabul miktarları sıfırdan büyük olmalı.");
          }
          if (!Double.isFinite(line.unitCost) || line.unitCost < 0) {
            throw new ValidationException("Birim alış fiyatı geçersiz.");
          }
          JSONObject serialized = new JSONObject();
          serialized.put("product_id", line.productId);
          serialized.put("quantity", line.quantity);
          serialized.put("unit_cost", line.unitCost);
          serializedLines.put(serialized);
        }
        JSONObject payload = new JSONObject();
        payload.put("supplier_id", text(supplierId));
        payload.put("lines", serializedLines);
        payload.put("note", limitedText(note, 2000, "Not"));
        return payload;
      } catch (ValidationException error) {
        throw error;
      } catch (Exception error) {
        throw new ValidationException("Mal kabulü hazırlanamadı.");
      }
    }

    void clear() {
      lines.clear();
      supplierId = "";
      note = "";
    }
  }

  static final class ReceivingLine {
    final String productId;
    final String productName;
    final double quantity;
    final double unitCost;
    final String currency;

    ReceivingLine(
        String productId,
        String productName,
        double quantity,
        double unitCost,
        String currency
    ) {
      this.productId = productId;
      this.productName = productName;
      this.quantity = quantity;
      this.unitCost = unitCost;
      this.currency = currency;
    }
  }

  static final class ValidationException extends Exception {
    ValidationException(String message) {
      super(message);
    }
  }
}
