package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidMenuProductTest {
  @Test public void sharedCatalogDoesNotExposeRetailNavigationAndChannelEditsRequirePermission() {
    OperationData data = new OperationData();
    data.capabilitiesResolved = true; data.permissionsResolved = true; data.deviceActive = true; data.deviceRole = "admin";
    for (String capability : new String[] { "service.android", "food_service.menu", "commerce.catalog", "commerce.sales", "commerce.inventory" })
      data.businessCapabilities.add(capability);
    data.permissions.add("menu.edit"); data.permissions.add("market.product.view"); data.permissions.add("market.summary.view");
    assertFalse(AndroidUiRules.canOpenTab(data, AndroidUiRules.TAB_MARKET));
    assertEquals("", AndroidActionPolicy.validationError(data, "menu_entry_create", new JSONObject()));
    data.businessCapabilities.remove("commerce.catalog");
    assertFalse(AndroidActionPolicy.validationError(data, "menu_entry_create", new JSONObject()).isEmpty());
    data.businessCapabilities.add("commerce.catalog"); data.deviceRole = "staff";
    data.permissions.remove("menu.edit");
    assertFalse(AndroidActionPolicy.validationError(data, "menu_entry_update", new JSONObject()).isEmpty());
  }

  @Test public void menuChannelDraftDoesNotCopyCanonicalProductFields() throws Exception {
    OperationData.MenuItem item = OperationData.MenuItem.fromJson(new JSONObject()
        .put("id", "entry-1").put("product_id", "product-1").put("category_id", "cat-1")
        .put("name", "Canonical").put("price", 40).put("price_override", JSONObject.NULL)
        .put("stock_unit", "l").put("stock_consumption_quantity", 0.125)
        .put("product_is_active", false).put("updated_at", "revision-1")
        .put("allergens", new JSONArray().put("süt")).put("tags", new JSONArray().put("yeni")));
    assertEquals("product-1", item.productId);
    assertFalse(item.productActive);
    JSONObject update = MenuEntryPresentationDialog.channelPayload(item, false);
    assertEquals("entry-1", update.getString("menu_entry_id"));
    assertEquals("revision-1", update.getString("expected_updated_at"));
    assertTrue(update.isNull("price_override"));
    assertEquals(0.125, update.getDouble("stock_consumption_quantity"), 0);
    assertEquals("süt", update.getJSONArray("allergens").getString(0));
    for (String field : new String[] { "name", "price", "product", "product_id", "stock_unit", "stock_quantity", "image_url" })
      assertFalse(update.has(field));
    JSONObject create = MenuEntryPresentationDialog.channelPayload(item, true);
    assertFalse(create.has("menu_entry_id"));
    assertFalse(create.has("expected_updated_at"));
    item.priceOverride = 0d;
    assertEquals(0, MenuEntryPresentationDialog.channelPayload(item, false).getDouble("price_override"), 0);
  }

  @Test public void invalidChannelPriceOrConsumptionCannotBeSent() throws Exception {
    OperationData.MenuItem draft = new OperationData.MenuItem();
    draft.id = "entry-1"; draft.categoryId = "cat-1";
    for (double quantity : new double[] { 0, -1, Double.NaN, Double.POSITIVE_INFINITY }) {
      draft.stockConsumptionQuantity = quantity;
      try { MenuEntryPresentationDialog.channelPayload(draft, false); fail("invalid consumption accepted"); }
      catch (IllegalArgumentException expected) {}
    }
    draft.stockConsumptionQuantity = 0.0001;
    for (double price : new double[] { -1, Double.NaN, Double.POSITIVE_INFINITY }) {
      draft.priceOverride = price;
      try { MenuEntryPresentationDialog.channelPayload(draft, false); fail("invalid price accepted"); }
      catch (IllegalArgumentException expected) {}
    }
  }

  @Test public void snapshotDiscoveryAndStockKeepCanonicalIdentity() throws Exception {
    JSONObject snapshot = new JSONObject().put("business_capabilities", new JSONArray()
        .put("service.android").put("food_service.menu").put("commerce.catalog").put("commerce.inventory"))
        .put("menu_product_candidates", new JSONArray().put(new JSONObject()
        .put("product_id", "product-unlinked").put("name", "Existing").put("unit", "ml").put("sale_price", 3)))
        .put("trackedStockItems", new JSONArray().put(new JSONObject().put("product_id", "product-unlinked")
            .put("menu_entry_id", "").put("stock_unit", "ml").put("stock_quantity", 1.2345)));
    OperationData data = OperationData.fromJson(snapshot, "phone-1");
    assertEquals("product-unlinked", data.menuProductCandidates.get(0).getString("product_id"));
    assertEquals(1.2345, data.trackedStockByProductId("product-unlinked").stockQuantity, 0);
    snapshot.put("business_capabilities", new JSONArray().put("commerce.catalog"));
    assertTrue(OperationData.fromJson(snapshot, "phone-1").menuProductCandidates.isEmpty());
  }
}
