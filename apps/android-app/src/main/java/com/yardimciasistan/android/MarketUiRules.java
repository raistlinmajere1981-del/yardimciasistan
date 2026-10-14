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
  static final String PERMISSION_PRODUCT_CREATE = "market.product_create";
  static final String PERMISSION_CART_DRAFT = "market.cart_draft";
  static final String PERMISSION_SCAN_TO_DESKTOP = "market.scan_to_desktop";

  static final String ACTION_STOCK_COUNT = "market_stock_count";
  static final String ACTION_PURCHASE_RECEIVE = "market_purchase_receive";
  static final String ACTION_PRODUCT_CREATE = "market_product_create";
  static final String ACTION_CART_DRAFT_CREATE = "market_cart_draft_create";
  static final String ACTION_BARCODE_SCAN = "market_barcode_scan";
  static final String PERMISSION_SALE = "market.sale.complete";
  static final String PERMISSION_CREDIT_VIEW = "customer_credit.view";
  static final String PERMISSION_CREDIT_PAYMENT = "customer_credit.payment";
  static final String ACTION_SALE = "market_sale_complete";
  static final String ACTION_CREDIT_PAYMENT = "customer_credit_payment_add";
  static final long BARCODE_DEBOUNCE_MS = 1_000L;

  private static final String[] MARKET_PERMISSIONS = {
      PERMISSION_SUMMARY,
      PERMISSION_PRODUCT_VIEW,
      PERMISSION_STOCK_COUNT,
      PERMISSION_RECEIVING,
      PERMISSION_PRODUCT_CREATE,
      PERMISSION_CART_DRAFT,
      PERMISSION_SCAN_TO_DESKTOP, PERMISSION_SALE, PERMISSION_CREDIT_VIEW, PERMISSION_CREDIT_PAYMENT
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

  static boolean canCreateProduct(OperationData data) {
    return canOpenMarket(data) && data.hasPermission(PERMISSION_PRODUCT_CREATE);
  }

  static boolean canLookupProductData(OperationData data) {
    return canCreateProduct(data)
        && data.market != null
        && data.market.productData != null
        && data.market.productData.enabled;
  }

  static boolean canCreateCartDraft(OperationData data) {
    return canViewProducts(data) && data.hasPermission(PERMISSION_CART_DRAFT);
  }

  static boolean canCompleteSale(OperationData data) {
    return canViewProducts(data) && data.hasPermission(PERMISSION_SALE);
  }

  static boolean canViewCredit(OperationData data) {
    return canOpenMarket(data) && data.hasPermission(PERMISSION_CREDIT_VIEW);
  }

  static boolean canPayCredit(OperationData data) {
    return canViewCredit(data) && data.hasPermission(PERMISSION_CREDIT_PAYMENT);
  }

  static OperationData.CustomerCreditAccount creditAccount(OperationData data, String customerId) {
    if (!canViewCredit(data)) return null;
    for (OperationData.CustomerCreditAccount account : data.market.customerCreditAccounts) {
      if (account.customerId.equals(customerId)) return account;
    }
    return null;
  }

  static String financialFeedback(String type, String status) {
    if ("applied".equals(status)) return ACTION_CREDIT_PAYMENT.equals(type)
        ? "Tahsilat masaüstünde kaydedildi." : "Satış masaüstünde kaydedildi.";
    if ("failed".equals(status)) return "Masaüstü işlemi reddetti; hata bilgisini kontrol edin.";
    return "Masaüstünde onay bekliyor";
  }

  static JSONObject creditPaymentPayload(OperationData data, String customerId, String currency,
      String amountText, String method, boolean externalConfirmed) throws ValidationException {
    if (!canPayCredit(data)) throw new ValidationException("Cari tahsilat yetkiniz yok.");
    OperationData.CustomerCreditAccount account = creditAccount(data, customerId);
    if (account == null) throw new ValidationException("Güncel müşteri hesabını seçin.");
    long debt = -1;
    for (OperationData.CreditBalance balance : account.balances) if (balance.currency.equals(currency)) debt = balance.amountMinor;
    long amount;
    try { amount = new java.math.BigDecimal(text(amountText).replace(',', '.')).movePointRight(2).longValueExact(); }
    catch (Exception error) { throw new ValidationException("Tahsilat tutarını en fazla iki ondalıkla girin."); }
    if (amount <= 0 || amount > debt || amount > 999999999999L) throw new ValidationException("Tutar pozitif olmalı ve mevcut borcu aşmamalı.");
    validatePayment(method, externalConfirmed);
    try { return new JSONObject().put("customer_id", customerId).put("currency", currency).put("amount_minor", amount)
        .put("expected_balance_minor", debt).put("payment_method", method).put("external_payment_confirmed", externalConfirmed); }
    catch (Exception error) { throw new ValidationException("Tahsilat hazırlanamadı."); }
  }

  private static void validatePayment(String method, boolean externalConfirmed) throws ValidationException {
    if (!java.util.Arrays.asList("cash", "card", "bank", "other").contains(method)) throw new ValidationException("Ödeme yöntemi seçin.");
    if ("card".equals(method) && !externalConfirmed) throw new ValidationException("Kart ödemesinin harici POS'ta gerçekleştiğini onaylayın.");
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
    if (ACTION_PRODUCT_CREATE.equals(actionType)) return PERMISSION_PRODUCT_CREATE;
    if (ACTION_CART_DRAFT_CREATE.equals(actionType)) return PERMISSION_CART_DRAFT;
    if (ACTION_BARCODE_SCAN.equals(actionType)) return PERMISSION_SCAN_TO_DESKTOP;
    if (ACTION_SALE.equals(actionType)) return PERMISSION_SALE;
    if (ACTION_CREDIT_PAYMENT.equals(actionType)) return PERMISSION_CREDIT_PAYMENT;
    return null;
  }

  static JSONObject barcodeScanPayload(String rawBarcode, String scannedAt)
      throws ValidationException {
    String barcode = limitedText(normalizeBarcodeIdentity(rawBarcode), 120, "Barkod");
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
    String barcode = normalizeBarcodeIdentity(rawBarcode);
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

  static JSONObject productCreatePayload(
      String barcode,
      String proposedName,
      String sku,
      String unit,
      String rawPurchasePrice,
      String rawSalePrice,
      String category,
      String note
  ) throws ValidationException {
    String normalizedBarcode = limitedText(normalizeBarcodeIdentity(barcode), 120, "Barkod");
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
      payload.put("name", normalizedName);
      payload.put("sku", limitedText(sku, 120, "SKU"));
      payload.put("unit", normalizedUnit);
      payload.put("purchase_price", purchasePrice);
      payload.put("sale_price", salePrice);
      payload.put("category", limitedText(category, 180, "Kategori"));
      payload.put("currency", "TRY");
      payload.put("track_inventory", true);
      payload.put("note", limitedText(note, 2000, "Not"));
      return payload;
    } catch (ValidationException error) {
      throw error;
    } catch (Exception error) {
      throw new ValidationException("Ürün kaydı hazırlanamadı.");
    }
  }

  static String normalizeBarcodeIdentity(String raw) {
    String value = text(raw);
    if (value.isEmpty()) return "";

    boolean hasDigit = false;
    boolean hasLetter = false;
    for (int index = 0; index < value.length(); index += 1) {
      char character = value.charAt(index);
      if (character >= '0' && character <= '9') hasDigit = true;
      if (Character.isLetter(character)) hasLetter = true;
    }
    if (!hasDigit || hasLetter) return value;

    StringBuilder digits = new StringBuilder(value.length());
    for (int index = 0; index < value.length(); index += 1) {
      char character = value.charAt(index);
      if (character >= '0' && character <= '9') digits.append(character);
    }
    return digits.toString();
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

  static final class BarcodeCameraGate {
    private final long rearmGapMs;
    private String lockedBarcode = "";
    private long lastSeenAt = Long.MIN_VALUE;

    BarcodeCameraGate(long rearmGapMs) {
      this.rearmGapMs = Math.max(0L, rearmGapMs);
    }

    String observe(String rawBarcode, long nowMs) {
      String barcode = text(rawBarcode);
      if (barcode.isEmpty()) {
        if (!lockedBarcode.isEmpty()
            && lastSeenAt != Long.MIN_VALUE
            && nowMs >= lastSeenAt
            && nowMs - lastSeenAt >= rearmGapMs) {
          lockedBarcode = "";
          lastSeenAt = Long.MIN_VALUE;
        }
        return "";
      }

      if (barcode.equals(lockedBarcode)) {
        lastSeenAt = nowMs;
        return "";
      }

      lockedBarcode = barcode;
      lastSeenAt = nowMs;
      return barcode;
    }
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
        CartLine line = new CartLine(
            product.id,
            product.name,
            product.salePrice,
            product.currency,
            product.unit,
            1
        );
        line.updatedAt = product.updatedAt;
        lines.put(product.id, line);
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

    JSONObject toSalePayload(OperationData data, String settlement, String customerId, String method,
        boolean externalConfirmed) throws ValidationException {
      if (!canCompleteSale(data)) throw new ValidationException("Mobil satış yetkiniz yok.");
      if (!"paid".equals(settlement) && !"credit".equals(settlement)) throw new ValidationException("Ödeme seçimi geçersiz.");
      if ("credit".equals(settlement)) {
        if (creditAccount(data, customerId) == null) throw new ValidationException("Veresiye için kayıtlı müşteri seçin.");
      } else { validatePayment(method, externalConfirmed); }
      if (data.hasBusinessCapability(CAPABILITY_INVENTORY) && data.market.primaryLocationId.isEmpty()) throw new ValidationException("Stok konumunu yenileyin.");
      JSONObject payload = toPayload();
      payload.remove("note");
      JSONArray serialized = payload.optJSONArray("lines");
      String currency = "";
      int index = 0;
      try {
        for (CartLine line : lines.values()) {
          if (!currency.isEmpty() && !currency.equals(line.currency)) throw new ValidationException("Tek satışta birden fazla para birimi kullanılamaz.");
          currency = line.currency;
          if (line.updatedAt.isEmpty() || !Double.isFinite(line.unitPrice) || productById(data, line.productId) == null) throw new ValidationException("Güncel ürün bilgilerini yenileyin.");
          serialized.getJSONObject(index++).put("expected_unit_price", line.unitPrice).put("expected_currency", line.currency).put("expected_updated_at", line.updatedAt);
        }
        return payload.put("location_id", data.market.primaryLocationId).put("settlement", settlement)
            .put("customer_id", "credit".equals(settlement) ? customerId : "")
            .put("payment_method", "credit".equals(settlement) ? "" : method).put("external_payment_confirmed", externalConfirmed);
      } catch (ValidationException error) { throw error; }
      catch (Exception error) { throw new ValidationException("Satış hazırlanamadı."); }
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
    String updatedAt = "";
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
