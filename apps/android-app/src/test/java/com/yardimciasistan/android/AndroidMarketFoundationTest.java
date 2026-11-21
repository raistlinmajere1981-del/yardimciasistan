package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidMarketFoundationTest {
  @Test
  public void qrOrderPreviewParsesWithoutTreatingTheRequestAsAnApproval() throws Exception {
    JSONObject input = new JSONObject()
        .put("id","req-room")
        .put("request_type","room_order")
        .put("status","new")
        .put("qr_order",new JSONObject()
            .put("kind","room")
            .put("source_id","room-01")
            .put("source_label","101")
            .put("total",63)
            .put("currency","TRY")
            .put("invalid_items",false)
            .put("items",new JSONArray().put(new JSONObject()
                .put("name","Çay").put("quantity",2).put("note","Az şeker")
                .put("unit_price",15.5).put("currency","TRY"))));
    OperationData.RequestRecord request=OperationData.RequestRecord.fromJson(input);
    assertTrue(AndroidUiRules.isQrOrderRequest(request));
    assertEquals("Oda QR siparişi",AndroidPresentation.formatRequestType(request.type));
    assertEquals("101",request.qrOrder.sourceLabel);
    assertEquals(1,request.qrOrder.items.size());
    assertEquals("Az şeker",request.qrOrder.items.get(0).note);
    assertEquals(31,request.qrOrder.items.get(0).unitPrice * request.qrOrder.items.get(0).quantity,0);
    assertFalse(AndroidUiRules.canConvertRequest(new OperationData(),request));
    OperationData.RequestRecord legacy=OperationData.RequestRecord.fromJson(
        new JSONObject().put("id","old").put("request_type","table_order"));
    assertTrue(AndroidUiRules.isQrOrderRequest(legacy));
    assertTrue(legacy.qrOrder == null);
    assertEquals("Masa QR siparişi",AndroidPresentation.formatRequestType(legacy.type));
    assertFalse(AndroidUiRules.isQrOrderRequest(OperationData.RequestRecord.fromJson(
        new JSONObject().put("request_type","general_info"))));
    assertFalse("Old preview must not grant unimported order approval", request.qrOrder.decisionReady);
  }

  @Test
  public void qrOrderApprovalRequiresMatchingSnapshotVersionCapabilityAndPermissions() throws Exception {
    OperationData data = new OperationData();
    data.capabilitiesResolved = true;
    data.permissionsResolved = true;
    data.deviceActive = true;
    for (String cap : new String[] {
        "service.android","core.customers","customer.requests","channel.qr_menu",
        "food_service.menu","food_service.orders","food_service.tables",
        "accommodation.rooms","accommodation.stays","accommodation.folio"
    }) data.businessCapabilities.add(cap);
    for (String permission : new String[] {
        "table_order.view","table_order.add_item","room_folio.view",
        "room_folio.add_menu_item","menu.view","customer.reject"
    }) data.permissions.add(permission);
    JSONObject preview=new JSONObject()
        .put("decision_ready",true)
        .put("kind","table").put("source_id","table-1").put("source_label","Masa 1")
        .put("invalid_items",false)
        .put("items",new JSONArray().put(new JSONObject().put("name","Çay")
            .put("quantity",1).put("unit_price",20).put("currency","TRY").put("note","")));
    OperationData.RequestRecord table=OperationData.RequestRecord.fromJson(new JSONObject()
        .put("id","qr-table-1").put("request_type","table_order").put("status","new")
        .put("updated_at","2026-11-20T10:00:00.000Z").put("qr_order",preview));
    data.requests.add(table);
    JSONObject payload=new JSONObject()
        .put("request_id",table.id).put("expected_updated_at",table.updatedAt);
    assertTrue(AndroidUiRules.canDecideQrOrder(data,table,true));
    table.qrOrder.decisionReady=false;
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,true));
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,false));
    table.qrOrder.decisionReady=true;
    assertEquals("", AndroidActionPolicy.validationError(data,"qr_table_order_accept",payload));
    assertEquals("", AndroidActionPolicy.validationError(data,"qr_order_reject",payload));
    assertFalse(AndroidActionPolicy.validationError(data,"qr_room_order_accept",payload).isEmpty());

    data.permissions.remove("table_order.add_item");
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,true));
    assertFalse(AndroidActionPolicy.validationError(data,"qr_table_order_accept",payload).isEmpty());
    data.permissions.add("table_order.add_item");
    assertFalse(AndroidActionPolicy.validationError(data,"qr_table_order_accept",
        new JSONObject().put("request_id",table.id).put("expected_updated_at","stale")).isEmpty());
    assertFalse(AndroidActionPolicy.validationError(data,"qr_table_order_accept",
        new JSONObject().put("request_id",table.id).put("expected_updated_at",table.updatedAt)
            .put("status","approved")).isEmpty());

    data.businessCapabilities.remove("channel.qr_menu");
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,true));
    data.businessCapabilities.add("channel.qr_menu");
    table.qrOrder.invalidItems=true;
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,true));
    assertTrue(AndroidUiRules.canDecideQrOrder(data,table,false));
    table.qrOrder.invalidItems=false;
    table.status="approved";
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,true));
    assertFalse(AndroidUiRules.canDecideQrOrder(data,table,false));

    OperationData.RequestRecord room=OperationData.RequestRecord.fromJson(new JSONObject()
        .put("id","qr-room-1").put("request_type","room_order").put("status","new")
        .put("updated_at","2026-11-20T10:01:00.000Z")
        .put("qr_order",new JSONObject(preview.toString())
            .put("kind","room").put("source_id","room-1").put("source_label","Oda 101")));
    data.requests.add(room);
    JSONObject roomPayload=new JSONObject()
        .put("request_id",room.id).put("expected_updated_at",room.updatedAt);
    assertTrue(AndroidUiRules.canDecideQrOrder(data,room,true));
    assertEquals("",AndroidActionPolicy.validationError(data,"qr_room_order_accept",roomPayload));
    assertFalse(AndroidActionPolicy.validationError(data,"qr_table_order_accept",roomPayload).isEmpty());
    data.permissions.remove("room_folio.view");
    assertFalse(AndroidUiRules.canDecideQrOrder(data,room,true));
  }

  @Test
  public void customerCommercialProfilesAreOptionalAndCannotCreateDealerFromUnknownValues() throws Exception {
    OperationData.CustomerRecord company=OperationData.CustomerRecord.fromJson(new JSONObject()
        .put("id","company-1").put("full_name","Firma")
        .put("commercial_profile",new JSONObject()
            .put("company_name","Ticari Firma")
            .put("tax_office","Çankaya")
            .put("tax_number","1234567890")
            .put("authorized_person","Veli")
            .put("dealer_status","active")
            .put("price_group","dealer_a")
            .put("payment_term_days",30)));
    assertTrue(company.commercialProfile != null);
    assertEquals("Ticari Firma",company.commercialProfile.companyName);
    assertEquals("Çankaya",company.commercialProfile.taxOffice);
    assertEquals("1234567890",company.commercialProfile.taxNumber);
    assertEquals("active",company.commercialProfile.dealerStatus);
    assertEquals("dealer_a",company.commercialProfile.priceGroup);
    assertEquals(30,company.commercialProfile.paymentTermDays);

    OperationData.CustomerRecord ordinary=OperationData.CustomerRecord.fromJson(
        new JSONObject().put("id","ordinary").put("full_name","Kişi"));
    assertTrue(ordinary.commercialProfile == null);
    OperationData.CustomerRecord invalid=OperationData.CustomerRecord.fromJson(new JSONObject()
        .put("commercial_profile",new JSONObject()
            .put("company_name","Firma")
            .put("dealer_status","superadmin")
            .put("price_group","secret")
            .put("payment_term_days",999999)));
    assertTrue(invalid.commercialProfile != null);
    assertEquals("inactive",invalid.commercialProfile.dealerStatus);
    assertEquals("retail",invalid.commercialProfile.priceGroup);
    assertEquals(3650,invalid.commercialProfile.paymentTermDays);
  }

  @Test
  public void missingMarketSnapshotUsesSafeEmptyModel() {
    OperationData data = OperationData.fromJson(new MissingMarketSnapshot());

    assertTrue(data.capabilitiesResolved);
    assertTrue(data.market.products.isEmpty());
    assertTrue(data.market.suppliers.isEmpty());
    assertTrue(data.market.recentPurchases.isEmpty());
    assertTrue(data.market.cartDrafts.isEmpty());
    assertFalse(data.market.productData.enabled);
    assertEquals("open_food_facts", data.market.productData.provider);
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
        "market.product_create",
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
        "market.product_create",
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
