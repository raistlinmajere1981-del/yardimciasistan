package com.yardimciasistan.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

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
  }
}
