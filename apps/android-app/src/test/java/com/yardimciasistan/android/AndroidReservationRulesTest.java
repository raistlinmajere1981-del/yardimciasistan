package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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

  private static OperationData authorizedData() {
    OperationData data = new OperationData();
    data.permissionsResolved = true;
    data.deviceActive = true;
    data.deviceRole = "staff";
    data.permissions.clear();
    return data;
  }
}
