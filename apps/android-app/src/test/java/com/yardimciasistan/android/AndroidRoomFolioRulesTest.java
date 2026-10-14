package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidRoomFolioRulesTest {
  @Test
  public void roomFolioPermissionOpensPensionAccountsMode() {
    OperationData data = new OperationData();
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.deviceActive = true;
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FOLIO);
    data.permissions.clear();
    data.permissions.add("room_folio.view");

    assertTrue(AndroidUiRules.canOpenPensionMode(data, AndroidUiRules.PENSION_FOLIOS));
    assertEquals(AndroidUiRules.PENSION_FOLIOS, AndroidUiRules.firstPensionMode(data));
  }

  @Test
  public void pensionFolioRouteResolvesToAccountsMode() {
    AndroidUiRules.Destination destination = AndroidUiRules.resolveDestination("pension:folios");
    assertEquals(AndroidUiRules.TAB_PENSION, destination.tab);
    assertEquals(AndroidUiRules.PENSION_FOLIOS, destination.mode);
  }

  @Test
  public void roomFolioActionFailuresReturnToAccountsMode() {
    assertEquals("pension:folios", NotificationEventDetector.routeForAction("room_folio_payment_add"));
    assertEquals("pension:folios", NotificationEventDetector.routeForAction("room_folio_checkout"));
    assertEquals("pension:folios", NotificationEventDetector.routeForAction("room_folio_menu_item_add"));
    assertEquals("pension:folios", NotificationEventDetector.routeForAction("room_folio_manual_charge_add"));
  }

  @Test public void snapshotKeepsChargeVersionAndFailsClosedWithoutIt() throws Exception {
    OperationData.RoomFolioRecord folio = folio();
    assertTrue(folio.canAddItems);
    assertEquals(version(), folio.version);
    OperationData.RoomFolioRecord old = OperationData.RoomFolioRecord.fromJson(new JSONObject().put("id", "old"));
    assertFalse(old.canAddItems);
    assertFalse(RoomFolioWorkspace.canAddManualCharge(authorizedData(), old));
    folio.canAddItems = false;
    assertFalse(RoomFolioWorkspace.canAddMenuItems(authorizedData(), folio));
  }

  @Test public void chargePermissionsAreExplicitForStaffAndAdminsAndCloseWithCapabilities() throws Exception {
    for (String role : new String[] { "staff", "admin" }) {
      OperationData data = authorizedData();
      data.deviceRole = role;
      for (String type : new String[] { "room_folio_menu_item_add", "room_folio_manual_charge_add" }) {
        JSONObject payload = new JSONObject().put("expected_folio_version", version());
        assertEquals("", AndroidActionPolicy.validationError(data, type, payload));
        for (String capability : new String[] { "service.android", "accommodation.folio", "accommodation.stays" }) {
          data.businessCapabilities.remove(capability);
          assertFalse(AndroidActionPolicy.validationError(data, type, payload).isEmpty());
          data.businessCapabilities.add(capability);
        }
        for (String permission : new String[] { "room_folio.view", AndroidActionPolicy.requiredPermissionForAction(type, payload) }) {
          data.permissions.remove(permission);
          assertFalse(AndroidActionPolicy.validationError(data, type, payload).isEmpty());
          data.permissions.add(permission);
        }
        data.deviceActive = false;
        assertFalse(AndroidActionPolicy.validationError(data, type, payload).isEmpty());
        data.deviceActive = true;
        data.permissionsResolved = false;
        assertFalse(AndroidActionPolicy.validationError(data, type, payload).isEmpty());
        data.permissionsResolved = true;
        assertFalse(AndroidActionPolicy.validationError(data, type, new JSONObject()).isEmpty());
      }
      data.permissions.remove("menu.view");
      assertFalse(RoomFolioWorkspace.canAddMenuItems(data, folio()));
      assertFalse(AndroidActionPolicy.validationError(data, "room_folio_menu_item_add", new JSONObject().put("expected_folio_version", version())).isEmpty());
      assertTrue(RoomFolioWorkspace.canAddManualCharge(data, folio()));
      data.permissions.add("menu.view");
      data.businessCapabilities.remove("food_service.menu");
      assertFalse(RoomFolioWorkspace.canAddMenuItems(data, folio()));
      assertTrue(RoomFolioWorkspace.canAddManualCharge(data, folio()));
    }
  }

  @Test public void menuPayloadKeepsPriceCurrencyIdentityAndQuantityWithoutChangingTotals() throws Exception {
    OperationData.RoomFolioRecord folio = folio();
    OperationData.MenuItem menu = menu();
    JSONObject payload = RoomFolioWorkspace.menuChargePayload(folio, menu, 2);
    assertEquals("folio-1", payload.getString("folio_id"));
    assertEquals("menu-1", payload.getString("menu_entry_id"));
    assertEquals(2, payload.getInt("quantity"));
    assertEquals(987, payload.getLong("expected_unit_price_minor"));
    assertEquals("TRY", payload.getString("expected_currency"));
    assertEquals("menu-version-1", payload.getString("expected_menu_updated_at"));
    assertEquals(version(), payload.getString("expected_folio_version"));
    assertEquals(10000, folio.chargeTotalMinor);
    assertFalse(payload.has("unit_price_minor"));
    assertFalse(payload.has("product_id"));
    ActionOutbox.PendingAction pending = ActionOutbox.PendingAction.create("action-1", "room_folio_menu_item_add", payload, "target-1");
    ActionOutbox.PendingAction restored = ActionOutbox.PendingAction.fromJson(pending.toJson());
    assertEquals(pending.id, restored.id);
    assertEquals(payload.toString(), restored.payload.toString());
    assertTrue(restored.matchesTarget("target-1"));
    assertFalse(restored.matchesTarget("target-2"));
  }

  @Test public void invalidMenuQuantityCurrencyActivityAndStockCannotBeQueued() throws Exception {
    OperationData.RoomFolioRecord folio = folio();
    OperationData.MenuItem menu = menu();
    for (int quantity : new int[] { 0, -1, 1001 }) expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, quantity));
    menu.stockQuantity = 0.125;
    expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, 2));
    menu.stockQuantity = null; // A device without stock visibility delegates availability to Desktop.
    assertEquals(2, RoomFolioWorkspace.menuChargePayload(folio, menu, 2).getInt("quantity"));
    menu.currency = "USD";
    expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, 1));
    menu.currency = "TRY";
    menu.available = false;
    expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, 1));
    menu.available = true;
    menu.productActive = false;
    expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, 1));
    menu.productActive = true;
    menu.price = Double.NaN;
    expectInvalid(() -> RoomFolioWorkspace.menuChargePayload(folio, menu, 1));
  }

  @Test public void manualChargeUsesMinorUnitsAndNeverOffersDiscount() throws Exception {
    JSONObject payload = RoomFolioWorkspace.manualChargePayload(folio(), "  Otopark  ", 12345, " İki gün ");
    assertEquals("Otopark", payload.getString("label"));
    assertEquals(12345, payload.getLong("amount_minor"));
    assertEquals("İki gün", payload.getString("note"));
    assertFalse(payload.has("kind"));
    assertEquals(null, AndroidActionPolicy.requiredPermissionForAction("room_folio_discount_add", payload));
    for (long amount : new long[] { 0, -1, 1000000000000L }) expectInvalid(() -> RoomFolioWorkspace.manualChargePayload(folio(), "Ek", amount, ""));
    expectInvalid(() -> RoomFolioWorkspace.manualChargePayload(folio(), "", 100, ""));
    expectInvalid(() -> RoomFolioWorkspace.manualChargePayload(folio(), repeat(121), 100, ""));
    expectInvalid(() -> RoomFolioWorkspace.manualChargePayload(folio(), "Ek", 100, repeat(501)));
  }

  private interface PayloadFactory { JSONObject create() throws Exception; }
  private static void expectInvalid(PayloadFactory factory) throws Exception {
    try { factory.create(); fail("Invalid charge accepted"); }
    catch (IllegalArgumentException expected) { assertFalse(expected.getMessage().isEmpty()); }
  }

  private static String repeat(int length) {
    StringBuilder value = new StringBuilder();
    for (int i = 0; i < length; i++) value.append('a');
    return value.toString();
  }
  private static String version() { return repeat(64); }
  private static OperationData.RoomFolioRecord folio() throws Exception {
    return OperationData.RoomFolioRecord.fromJson(new JSONObject().put("id", "folio-1")
        .put("version", version()).put("can_add_items", true).put("charge_total_minor", 10000).put("currency", "TRY"));
  }
  private static OperationData.MenuItem menu() throws Exception {
    return OperationData.MenuItem.fromJson(new JSONObject().put("id", "menu-1").put("product_id", "product-1")
        .put("price", 9.87).put("currency", "TRY").put("updated_at", "menu-version-1")
        .put("stock_quantity", 5).put("stock_consumption_quantity", 0.125));
  }
  private static OperationData authorizedData() throws Exception {
    return OperationData.fromJson(new JSONObject().put("business_capabilities", new JSONArray()
        .put("service.android").put("accommodation.folio").put("accommodation.stays").put("food_service.menu"))
        .put("androidPermissions", new JSONObject().put("device-1", new JSONObject().put("role", "staff").put("is_active", true)
            .put("permissions", new JSONArray().put("room_folio.view").put("room_folio.add_menu_item")
                .put("room_folio.add_manual_charge").put("menu.view")))), "device-1");
  }
}
