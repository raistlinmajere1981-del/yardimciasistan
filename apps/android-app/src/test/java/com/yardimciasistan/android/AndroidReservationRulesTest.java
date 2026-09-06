package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public final class AndroidReservationRulesTest {
  @Test
  public void reservationCreatePermissionKeepsEmptyRestaurantReservationModeVisible() {
    OperationData data = authorizedData();
    data.permissions.add("reservation.view");
    data.permissions.add("reservation.create");

    assertTrue(AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS));
  }

  @Test
  public void breakfastReservationsBelongToRestaurantOperations() {
    OperationData.ReservationRecord breakfast = new OperationData.ReservationRecord();
    breakfast.type = "breakfast";

    assertTrue(AndroidUiRules.isRestaurantReservation(breakfast));
    assertTrue(AndroidUiRules.isRestaurantOnlyReservation(breakfast));
  }

  @Test
  public void roomContextMakesTableTypedReservationMixedAndPensionFirst() {
    OperationData data = authorizedData();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ROOMS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    OperationData.ReservationRecord mixed = new OperationData.ReservationRecord();
    mixed.type = "table";
    mixed.roomIds.add("room-1");

    assertTrue(AndroidUiRules.isRestaurantReservation(mixed));
    assertTrue(AndroidUiRules.isPensionReservation(data, mixed));
    assertFalse(AndroidUiRules.isRestaurantOnlyReservation(mixed));
    assertEquals("pension:reservations", NotificationEventDetector.routeForReservation(data, mixed));
  }

  @Test
  public void combinedTypeWithoutAssignedResourcesRemainsPensionFirst() {
    OperationData data = authorizedData();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ACCOMMODATION_RESERVATIONS);
    OperationData.ReservationRecord combined = new OperationData.ReservationRecord();
    combined.type = "room_and_table";

    assertEquals("mixed", AndroidUiRules.reservationDomain(combined));
    assertEquals("pension:reservations", NotificationEventDetector.routeForReservation(data, combined));
  }

  @Test
  public void roomAndTableActionFailuresRouteToTheirOwnOperationScreens() {
    assertEquals("pension:reservations", NotificationEventDetector.routeForAction("reservation_room_update"));
    assertEquals("restaurant:reservations", NotificationEventDetector.routeForAction("reservation_table_create"));
  }

  @Test
  public void reservationCreateWithoutViewDoesNotOpenReservationPage() {
    OperationData data = authorizedData();
    data.permissions.add("reservation.create");
    assertFalse(AndroidUiRules.canOpenRestaurantMode(data, AndroidUiRules.RESTAURANT_RESERVATIONS));
  }

  @Test
  public void missingOrRevokedAndroidManifestCannotHydrateStaleOperations() {
    OperationData missingManifest = OperationData.fromJson(new StaleSnapshot(null));
    assertFalse(missingManifest.capabilitiesResolved);
    assertEquals(0, missingManifest.totalRequests);
    assertTrue(missingManifest.requests.isEmpty());

    OperationData revokedAndroid = OperationData.fromJson(new StaleSnapshot(
        new CapabilityArray(AndroidUiRules.CAPABILITY_CUSTOMERS)
    ));
    assertTrue(revokedAndroid.capabilitiesResolved);
    assertTrue(revokedAndroid.permissionsResolved);
    assertFalse(revokedAndroid.deviceActive);
    assertEquals(0, revokedAndroid.totalRequests);
    assertTrue(revokedAndroid.requests.isEmpty());
  }

  /**
   * Local JVM tests compile against android.jar, whose org.json mutators return
   * default null values. These tiny read-only fakes also make the important
   * invariant explicit: stale operational fields must never be read before an
   * authoritative, Android-enabled capability manifest is accepted.
   */
  private static final class StaleSnapshot extends JSONObject {
    private final JSONArray capabilities;

    StaleSnapshot(JSONArray capabilities) {
      this.capabilities = capabilities;
    }

    @Override
    public long optLong(String name, long fallback) {
      return 0L;
    }

    @Override
    public boolean has(String name) {
      return false;
    }

    @Override
    public JSONObject optJSONObject(String name) {
      if ("business".equals(name)) return null;
      throw new AssertionError("Stale object was read before the capability boundary: " + name);
    }

    @Override
    public JSONArray optJSONArray(String name) {
      if ("business_capabilities".equals(name)) return capabilities;
      throw new AssertionError("Stale array was read before the capability boundary: " + name);
    }
  }

  private static final class CapabilityArray extends JSONArray {
    private final String capability;

    CapabilityArray(String capability) {
      this.capability = capability;
    }

    @Override
    public int length() {
      return 1;
    }

    @Override
    public String optString(int index, String fallback) {
      return index == 0 ? capability : fallback;
    }
  }

  private static OperationData authorizedData() {
    OperationData data = new OperationData();
    data.permissionsResolved = true;
    data.capabilitiesResolved = true;
    data.deviceActive = true;
    data.deviceRole = "staff";
    data.permissions.clear();
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_ANDROID);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_CUSTOMERS);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_TABLES);
    data.businessCapabilities.add(AndroidUiRules.CAPABILITY_FOOD_RESERVATIONS);
    return data;
  }
}
