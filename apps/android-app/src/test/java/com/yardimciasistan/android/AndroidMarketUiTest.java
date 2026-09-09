package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AndroidMarketUiTest {
  @Test
  public void pureMarketProfileOnlyExposesRelevantNavigation() {
    OperationData data = marketData();
    data.permissions.add(MarketUiRules.PERMISSION_SUMMARY);
    data.permissions.add(MarketUiRules.PERMISSION_PRODUCT_VIEW);

    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MARKET));
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_PENSION));
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_RESTAURANT));
    assertEquals(
        AndroidUiRules.TAB_MARKET,
        AndroidUiRules.resolveDestination("market").tab
    );
  }

  @Test
  public void everyMarketCallToActionUsesItsEffectivePermission() {
    OperationData data = marketData();
    data.permissions.add(MarketUiRules.PERMISSION_PRODUCT_VIEW);

    assertFalse(MarketUiRules.canViewSummary(data));
    assertFalse(MarketUiRules.canStockCount(data));
    assertFalse(MarketUiRules.canReceive(data));
    assertFalse(MarketUiRules.canCreateProductDraft(data));
    assertFalse(MarketUiRules.canCreateCartDraft(data));

    data.permissions.add(MarketUiRules.PERMISSION_SUMMARY);
    assertTrue(MarketUiRules.canViewSummary(data));
    data.permissions.add(MarketUiRules.PERMISSION_STOCK_COUNT);
    assertTrue(MarketUiRules.canStockCount(data));
    data.permissions.add(MarketUiRules.PERMISSION_RECEIVING);
    assertTrue(MarketUiRules.canReceive(data));
    data.permissions.add(MarketUiRules.PERMISSION_PRODUCT_DRAFT);
    assertTrue(MarketUiRules.canCreateProductDraft(data));
    data.permissions.add(MarketUiRules.PERMISSION_CART_DRAFT);
    assertTrue(MarketUiRules.canCreateCartDraft(data));

    data.businessCapabilities.remove(MarketUiRules.CAPABILITY_PURCHASING);
    assertFalse(MarketUiRules.canReceive(data));
    assertTrue(MarketUiRules.canStockCount(data));
  }

  @Test
  public void cashBarcodeModeVisibilityRequiresPermissionAndAllThreeCapabilities() {
    OperationData data = marketData();
    assertFalse(MarketUiRules.canScanToDesktop(data));

    data.permissions.add(MarketUiRules.PERMISSION_SCAN_TO_DESKTOP);
    assertTrue(MarketUiRules.canScanToDesktop(data));
    assertEquals(
        MarketUiRules.PERMISSION_SCAN_TO_DESKTOP,
        MarketUiRules.requiredPermissionForAction(MarketUiRules.ACTION_BARCODE_SCAN)
    );

    data.businessCapabilities.remove(MarketUiRules.CAPABILITY_BARCODE);
    assertFalse(MarketUiRules.canScanToDesktop(data));
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_BARCODE);
    data.businessCapabilities.remove(MarketUiRules.CAPABILITY_SALES);
    assertFalse(MarketUiRules.canScanToDesktop(data));
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_SALES);
    data.businessCapabilities.remove(MarketUiRules.CAPABILITY_CATALOG);
    assertFalse(MarketUiRules.canScanToDesktop(data));
  }

  @Test
  public void continuousBarcodeCaptureCreatesActionWithoutConfirmationAndDebounces() throws Exception {
    MarketUiRules.BarcodeScanCapture capture =
        new MarketUiRules.BarcodeScanCapture(MarketUiRules.BARCODE_DEBOUNCE_MS);

    JSONObject first = capture.capture(" 8690000000001 ", 1_000L, "2026-09-08T08:00:00.000Z");
    assertNotNull(first);
    assertEquals("8690000000001", first.getString("barcode"));
    assertEquals("2026-09-08T08:00:00.000Z", first.getString("scanned_at"));
    assertNull(capture.capture("8690000000001", 1_999L, "2026-09-08T08:00:00.999Z"));

    JSONObject different = capture.capture("8690000000002", 2_000L, "2026-09-08T08:00:01.000Z");
    assertNotNull(different);
    JSONObject sameBarcodeAfterDifferent = capture.capture(
        "8690000000001",
        2_001L,
        "2026-09-08T08:00:01.001Z"
    );
    assertNotNull(sameBarcodeAfterDifferent);
    assertNull(capture.capture("8690000000001", 2_500L, "2026-09-08T08:00:01.500Z"));
    assertNotNull(capture.capture("8690000000001", 3_001L, "2026-09-08T08:00:02.001Z"));
  }

  @Test
  public void knownAndUnknownBarcodesResolveWithoutInventingProducts() {
    OperationData data = marketDataWithProducts();
    data.permissions.add(MarketUiRules.PERMISSION_PRODUCT_VIEW);
    data.permissions.add(MarketUiRules.PERMISSION_PRODUCT_DRAFT);

    OperationData.MarketProduct product = MarketUiRules.resolveBarcode(data, " 8690000000001 ");
    assertNotNull(product);
    assertEquals("Test Kola 330 ml", product.name);
    assertNull(MarketUiRules.resolveBarcode(data, "8699999999999"));
    assertTrue(MarketUiRules.canCreateProductDraft(data));
  }

  @Test
  public void stockCountPayloadCarriesAbsoluteQuantityAndNoDelta() throws Exception {
    OperationData.MarketProduct product = product("product-cola", "Test Kola 330 ml", "8690000000001", 7, 35);
    product.inventoryUpdatedAt = "2026-09-07T10:00:00.000Z";

    JSONObject payload = MarketUiRules.stockCountPayload(product, "3,5", "Raf sayımı");

    assertEquals("product-cola", payload.getString("product_id"));
    assertEquals(3.5, payload.getDouble("counted_quantity"), 0);
    assertEquals("2026-09-07T10:00:00.000Z", payload.getString("expected_updated_at"));
    assertFalse(payload.has("quantity_delta"));
    assertFalse(payload.has("delta"));
  }

  @Test
  public void repeatBarcodeIncrementsOneCartLineAndDraftHasNoPayment() throws Exception {
    OperationData.MarketProduct product = product("product-cola", "Test Kola 330 ml", "8690000000001", 7, 35);
    MarketUiRules.CartDraft cart = new MarketUiRules.CartDraft();

    cart.addProduct(product);
    cart.addProduct(product);
    JSONObject payload = cart.toPayload();

    assertEquals(1, cart.size());
    assertEquals(70, cart.estimatedTotal(), 0);
    JSONArray lines = payload.getJSONArray("lines");
    assertEquals(1, lines.length());
    assertEquals(2, lines.getJSONObject(0).getDouble("quantity"), 0);
    assertFalse(payload.has("payment_method"));
    assertFalse(payload.has("paymentMethod"));
    assertFalse(payload.has("sale"));
  }

  @Test
  public void receivingBuildsMultipleLinesAndRejectsInvalidNumbers() throws Exception {
    MarketUiRules.ReceivingDraft receiving = new MarketUiRules.ReceivingDraft();
    receiving.supplierId = "supplier-1";
    receiving.putProduct(product("p1", "Kola", "111", 1, 15), "2", "10,50");
    receiving.putProduct(product("p2", "Su", "222", 1, 5), "3", "4");

    JSONObject payload = receiving.toPayload();
    assertEquals("supplier-1", payload.getString("supplier_id"));
    assertEquals(2, payload.getJSONArray("lines").length());
    assertEquals(33, receiving.total(), 0);
    assertEquals(10.5, payload.getJSONArray("lines").getJSONObject(0).getDouble("unit_cost"), 0);

    assertReceivingInvalid(receiving, "0", "1");
    assertReceivingInvalid(receiving, "-1", "1");
    assertReceivingInvalid(receiving, "1", "");
    assertReceivingInvalid(receiving, "1", "invalid");
    assertReceivingInvalid(receiving, "1", "-1");
  }

  @Test
  public void productDraftUsesReviewSemanticsAndFoundationFields() throws Exception {
    JSONObject payload = MarketUiRules.productDraftPayload(
        "8690000000999",
        "Yeni ürün",
        "SKU-9",
        "piece",
        "4,5",
        "7,5",
        "Atıştırmalık",
        "Masaüstünde kontrol"
    );

    assertEquals("Yeni ürün", payload.getString("proposed_name"));
    assertEquals(4.5, payload.getDouble("proposed_purchase_price"), 0);
    assertEquals(7.5, payload.getDouble("proposed_sale_price"), 0);
    assertFalse(payload.has("photo"));
    assertFalse(payload.has("image"));
  }

  @Test
  public void offlineActionPersistsAndPendingStateIsVisible() throws Exception {
    InMemoryPreferences preferences = new InMemoryPreferences();
    ActionOutbox first = new ActionOutbox(preferences);
    JSONObject payload = new JSONObject().put("product_id", "p1").put("counted_quantity", 4);
    ActionOutbox.PendingAction pending = ActionOutbox.PendingAction.create(
        "android_action_market_1",
        MarketUiRules.ACTION_STOCK_COUNT,
        payload,
        "https://example.test/module",
        "secret"
    );
    first.appendAll(singleton(pending));

    ActionOutbox afterRestart = new ActionOutbox(preferences);
    assertEquals(1, afterRestart.load().size());
    assertEquals(MarketUiRules.ACTION_STOCK_COUNT, afterRestart.load().get(0).type);
    assertEquals("Gönderim bekliyor · 1 işlem telefonda", MarketUiRules.pendingStatus(1, 0));
    assertEquals("Masaüstü uygulaması bekleniyor · 2 işlem", MarketUiRules.pendingStatus(0, 2));
  }

  @Test
  public void missingMarketCapabilitiesRemainSafeForUi() throws Exception {
    JSONObject snapshot = new JSONObject();
    snapshot.put("business_capabilities", new JSONArray()
        .put(AndroidUiRules.CAPABILITY_ANDROID)
        .put(MarketUiRules.CAPABILITY_CATALOG));
    snapshot.put("androidPermissions", new JSONObject().put("devices", new JSONObject()));

    OperationData parsed = OperationData.fromJson(snapshot, "device-missing-market");

    assertNotNull(parsed.market);
    assertTrue(parsed.market.products.isEmpty());
    assertFalse(AndroidUiRules.canOpenTab(parsed, AndroidUiRules.TAB_MARKET));
    assertFalse(MarketUiRules.canScanToDesktop(parsed));
    assertNull(MarketUiRules.resolveBarcode(parsed, "8690000000001"));
  }

  private static void assertReceivingInvalid(
      MarketUiRules.ReceivingDraft receiving,
      String quantity,
      String unitCost
  ) {
    try {
      receiving.putProduct(product("invalid", "Hatalı", "999", 1, 1), quantity, unitCost);
      fail("Invalid receiving input was accepted: " + quantity + " / " + unitCost);
    } catch (MarketUiRules.ValidationException expected) {
      assertFalse(expected.getMessage().isEmpty());
    }
  }

  private static OperationData marketDataWithProducts() {
    OperationData data = marketData();
    data.market.products.add(product("product-cola", "Test Kola 330 ml", "8690000000001", 7, 35));
    OperationData.MarketProduct inactive = product("inactive", "Eski ürün", "8690000000002", 1, 1);
    inactive.active = false;
    data.market.products.add(inactive);
    return data;
  }

  private static OperationData marketData() {
    OperationData data = new OperationData();
    data.deviceActive = true;
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_CATALOG);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_INVENTORY);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_SALES);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_BARCODE);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_PURCHASING);
    data.businessCapabilities.add(MarketUiRules.CAPABILITY_SUPPLIERS);
    return data;
  }

  private static OperationData.MarketProduct product(
      String id,
      String name,
      String barcode,
      double quantity,
      double price
  ) {
    OperationData.MarketProduct product = new OperationData.MarketProduct();
    product.id = id;
    product.name = name;
    product.barcode = barcode;
    product.currentQuantity = quantity;
    product.salePrice = price;
    product.currency = "TRY";
    product.unit = "piece";
    product.active = true;
    product.trackInventory = true;
    return product;
  }

  private static List<ActionOutbox.PendingAction> singleton(ActionOutbox.PendingAction action) {
    ArrayList<ActionOutbox.PendingAction> actions = new ArrayList<>();
    actions.add(action);
    return actions;
  }

  private static final class InMemoryPreferences implements SharedPreferences {
    private final Map<String, Object> values = new HashMap<>();
    private final Set<OnSharedPreferenceChangeListener> listeners = new HashSet<>();

    @Override public Map<String, ?> getAll() { return new HashMap<>(values); }
    @Override public String getString(String key, String fallback) {
      Object value = values.get(key);
      return value instanceof String ? (String) value : fallback;
    }
    @SuppressWarnings("unchecked")
    @Override public Set<String> getStringSet(String key, Set<String> fallback) {
      Object value = values.get(key);
      return value instanceof Set ? new HashSet<>((Set<String>) value) : fallback;
    }
    @Override public int getInt(String key, int fallback) {
      Object value = values.get(key);
      return value instanceof Integer ? (Integer) value : fallback;
    }
    @Override public long getLong(String key, long fallback) {
      Object value = values.get(key);
      return value instanceof Long ? (Long) value : fallback;
    }
    @Override public float getFloat(String key, float fallback) {
      Object value = values.get(key);
      return value instanceof Float ? (Float) value : fallback;
    }
    @Override public boolean getBoolean(String key, boolean fallback) {
      Object value = values.get(key);
      return value instanceof Boolean ? (Boolean) value : fallback;
    }
    @Override public boolean contains(String key) { return values.containsKey(key); }
    @Override public Editor edit() { return new MemoryEditor(); }
    @Override public void registerOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) {
      listeners.add(listener);
    }
    @Override public void unregisterOnSharedPreferenceChangeListener(OnSharedPreferenceChangeListener listener) {
      listeners.remove(listener);
    }

    private final class MemoryEditor implements Editor {
      private final Map<String, Object> updates = new HashMap<>();
      private final Set<String> removals = new HashSet<>();
      private boolean clear;

      @Override public Editor putString(String key, String value) { updates.put(key, value); return this; }
      @Override public Editor putStringSet(String key, Set<String> value) {
        updates.put(key, value == null ? null : new HashSet<>(value));
        return this;
      }
      @Override public Editor putInt(String key, int value) { updates.put(key, value); return this; }
      @Override public Editor putLong(String key, long value) { updates.put(key, value); return this; }
      @Override public Editor putFloat(String key, float value) { updates.put(key, value); return this; }
      @Override public Editor putBoolean(String key, boolean value) { updates.put(key, value); return this; }
      @Override public Editor remove(String key) { removals.add(key); return this; }
      @Override public Editor clear() { clear = true; return this; }
      @Override public boolean commit() { applyChanges(); return true; }
      @Override public void apply() { applyChanges(); }

      private void applyChanges() {
        Set<String> changed = new HashSet<>();
        if (clear) {
          changed.addAll(values.keySet());
          values.clear();
        }
        for (String key : removals) {
          if (values.remove(key) != null) changed.add(key);
        }
        for (Map.Entry<String, Object> update : updates.entrySet()) {
          if (update.getValue() == null) values.remove(update.getKey());
          else values.put(update.getKey(), update.getValue());
          changed.add(update.getKey());
        }
        for (String key : changed) {
          for (OnSharedPreferenceChangeListener listener : listeners) {
            listener.onSharedPreferenceChanged(InMemoryPreferences.this, key);
          }
        }
      }
    }
  }
}
