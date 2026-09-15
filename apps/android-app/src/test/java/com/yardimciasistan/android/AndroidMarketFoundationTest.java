package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidMarketFoundationTest {
  @Test
  public void missingMarketSnapshotUsesSafeEmptyModel() {
    OperationData data = OperationData.fromJson(new MissingMarketSnapshot());

    assertTrue(data.capabilitiesResolved);
    assertTrue(data.market.products.isEmpty());
    assertTrue(data.market.suppliers.isEmpty());
    assertTrue(data.market.recentPurchases.isEmpty());
    assertTrue(data.market.productDrafts.isEmpty());
    assertTrue(data.market.cartDrafts.isEmpty());
    assertEquals(0, data.market.summary.todaySaleCount);
    assertEquals(0.0, data.market.summary.todaySalesTotal, 0.0);
    assertEquals("TRY", data.market.summary.currency);
  }

  @Test
  public void genericCommerceCapabilitiesDoNotOpenRetailWorkspace() {
    OperationData data = new OperationData();
    data.capabilitiesResolved = true;
    data.permissionsResolved = true;
    data.deviceActive = true;
    data.businessCapabilities.add("service.android");
    data.businessCapabilities.add("commerce.catalog");
    data.businessCapabilities.add("commerce.inventory");
    data.businessCapabilities.add("commerce.sales");
    for (String permission : new String[] {
        "market.summary.view",
        "market.product.view",
        "market.stock_count",
        "market.product_draft",
        "market.cart_draft"
    }) {
      data.permissions.add(permission);
    }

    assertFalse(MarketUiRules.hasRetailWorkspaceCapability(data));
    assertFalse(MarketUiRules.canOpenMarket(data));
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MARKET));

    data.businessCapabilities.add("retail.labels");
    assertTrue(MarketUiRules.hasRetailWorkspaceCapability(data));
    assertTrue(MarketUiRules.canOpenMarket(data));
    assertTrue(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MARKET));
  }

  @Test
  public void marketPermissionsRemainBoundedByBusinessCapabilities() {
    OperationData data = authorizedMarketData();
    for (String permission : new String[] {
        "market.summary.view",
        "market.product.view",
        "market.stock_count",
        "market.receiving",
        "market.product_draft",
        "market.cart_draft",
        "market.scan_to_desktop"
    }) {
      data.permissions.add(permission);
      assertTrue(permission, data.hasPermission(permission));
    }

    data.businessCapabilities.remove("retail.purchasing");
    assertFalse(data.hasPermission("market.receiving"));
    assertTrue(data.hasPermission("market.stock_count"));

    data.businessCapabilities.remove("retail.barcode");
    assertFalse(data.hasPermission("market.scan_to_desktop"));
    data.businessCapabilities.add("retail.barcode");
    data.businessCapabilities.remove("commerce.sales");
    assertFalse(data.hasPermission("market.scan_to_desktop"));
  }

  private static OperationData authorizedMarketData() {
    OperationData data = new OperationData();
    data.capabilitiesResolved = true;
    data.permissionsResolved = true;
    data.deviceActive = true;
    data.businessCapabilities.add("service.android");
    data.businessCapabilities.add("commerce.catalog");
    data.businessCapabilities.add("commerce.inventory");
    data.businessCapabilities.add("commerce.sales");
    data.businessCapabilities.add("retail.barcode");
    data.businessCapabilities.add("retail.suppliers");
    data.businessCapabilities.add("retail.purchasing");
    return data;
  }

  private static final class MissingMarketSnapshot extends JSONObject {
    @Override
    public long optLong(String name, long fallback) {
      return fallback;
    }

    @Override
    public boolean has(String name) {
      return false;
    }

    @Override
    public JSONObject optJSONObject(String name) {
      return null;
    }

    @Override
    public JSONArray optJSONArray(String name) {
      return "business_capabilities".equals(name)
          ? new AndroidCapabilityArray()
          : null;
    }
  }

  private static final class AndroidCapabilityArray extends JSONArray {
    @Override
    public int length() {
      return 1;
    }

    @Override
    public String optString(int index, String fallback) {
      return index == 0 ? "service.android" : fallback;
    }
  }
}
