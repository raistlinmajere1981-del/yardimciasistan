package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public final class AndroidActionPolicyTest {
  @Test
  public void inactiveDeviceFailsBeforeActionSpecificChecks() {
    OperationData data = baseData();
    data.deviceActive = false;

    assertEquals(
        "Cihaz masaüstünde pasifleştirilmiş.",
        AndroidActionPolicy.validationError(
            data,
            "table_order_open",
            new JSONObject()
        )
    );
  }

  @Test
  public void adminOnlyCustomerMutationRejectsStaff() {
    OperationData data = baseData();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.permissions.add("customer.manage");

    assertEquals(
        "Bu işlem yalnız yönetici cihazlarda kullanılabilir.",
        AndroidActionPolicy.validationError(
            data,
            "customer_update",
            new JSONObject()
        )
    );
  }

  @Test
  public void disabledDomainCapabilityRejectsOtherwisePermittedAction() {
    OperationData data = baseData();
    data.permissions.add("reservation.create");

    assertEquals(
        "Bu işlem işletmenin etkin özellikleri dışında.",
        AndroidActionPolicy.validationError(
            data,
            "reservation_room_create",
            new JSONObject()
        )
    );
  }

  @Test
  public void closePaidKeepsDedicatedPermissionMessage() {
    OperationData data = baseData();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TABLES);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ORDERS);

    assertEquals(
        "Bu cihazın hesap kapatma yetkisi yok.",
        AndroidActionPolicy.validationError(
            data,
            "table_order_close_paid",
            new JSONObject()
        )
    );
  }

  @Test
  public void unknownActionsFailClosed() {
    OperationData data = baseData();

    assertEquals(
        "Bu cihazın bu işlem için yetkisi yok.",
        AndroidActionPolicy.validationError(
            data,
            "unknown_action",
            new JSONObject()
        )
    );
  }

  @Test
  public void authorizedTableOrderActionPasses() {
    OperationData data = baseData();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TABLES);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ORDERS);
    data.permissions.add("table_order.open");

    assertEquals(
        "",
        AndroidActionPolicy.validationError(
            data,
            "table_order_open",
            new JSONObject()
        )
    );
  }

  private static OperationData baseData() {
    OperationData data = new OperationData();
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.deviceActive = true;
    data.deviceRole = "staff";
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    return data;
  }
}
