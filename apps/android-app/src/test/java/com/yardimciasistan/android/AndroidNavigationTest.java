package com.yardimciasistan.android;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import org.junit.Test;

public final class AndroidNavigationTest {
  private OperationData market() {
    OperationData data = new OperationData();
    data.permissionsResolved = true; data.capabilitiesResolved = true; data.deviceActive = true; data.deviceRole = "admin";
    data.businessCapabilities.addAll(Arrays.asList("service.android", "core.customers", "core.finance", "core.reports",
        "commerce.catalog", "commerce.sales", "commerce.inventory", "retail.barcode", "commerce.orders", "marketing.studio"));
    data.permissions.addAll(Arrays.asList("customer.view", "market.summary.view", "market.product.view", "finance.view",
        "commerce_order.view", "shipment.view", "marketing.status.view"));
    return data;
  }
  private List<String> routes(List<AndroidUiRules.NavigationItem> items) {
    List<String> routes = new ArrayList<>(); for (AndroidUiRules.NavigationItem item : items) routes.add(item.route); return routes;
  }

  @Test public void marketHasFourStableRootsAndEachSectionHasOneMenuLocation() {
    OperationData data = market();
    assertEquals(Arrays.asList("today", "customers", "market", "more"), routes(AndroidUiRules.rootNavigation(data)));
    assertEquals(Arrays.asList("cash", "reports", "today:commerce", "today:shipments", "today:marketing"), routes(AndroidUiRules.moreNavigation(data)));
    List<String> all = routes(AndroidUiRules.rootNavigation(data)); all.addAll(routes(AndroidUiRules.moreNavigation(data)));
    assertEquals(all.size(), new HashSet<>(all).size());
    assertFalse(all.contains("pension")); assertFalse(all.contains("restaurant"));
  }

  @Test public void mixedBusinessUsesFirstPermittedWorkspaceAndMovesRemainingDomainsToMore() {
    OperationData data = market();
    data.businessCapabilities.addAll(Arrays.asList("accommodation.rooms", "food_service.tables", "service.whatsapp"));
    data.permissions.addAll(Arrays.asList("room.view", "table.view"));
    assertEquals(Arrays.asList("today", "customers", "pension", "more"), routes(AndroidUiRules.rootNavigation(data)));
    assertTrue(routes(AndroidUiRules.moreNavigation(data)).containsAll(Arrays.asList("restaurant", "market")));
    assertFalse(routes(AndroidUiRules.moreNavigation(data)).contains("pension"));
    data.permissions.remove("room.view");
    assertEquals("restaurant", AndroidUiRules.primaryBusinessTab(data));
    data.permissions.remove("table.view"); assertEquals("market", AndroidUiRules.primaryBusinessTab(data));
  }

  @Test public void deviceRoleAndCapabilityCannotExposeHiddenRoutesOrRetainRevokedPage() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    assertTrue(nav.open(data, "reports")); assertEquals("more", nav.selectedRoot(data));
    data.deviceRole = "staff"; assertTrue(nav.normalize(data)); assertEquals("today", nav.route());
    assertFalse(nav.open(data, "reports"));
    assertTrue(nav.open(data, "today:commerce")); data.businessCapabilities.remove("commerce.orders");
    assertTrue(nav.normalize(data)); assertEquals("today", nav.route());
    assertFalse(routes(AndroidUiRules.moreNavigation(data)).contains("today:commerce"));
    assertFalse(nav.open(data, "pension:kbs")); assertEquals("today", nav.route());
    data.businessCapabilities.remove("service.android");
    assertEquals(Arrays.asList("today"), routes(AndroidUiRules.rootNavigation(data)));
    assertFalse(nav.open(data, "market")); assertFalse(nav.open(data, "cash"));
  }

  @Test public void unresolvedInactiveAndPermissionlessDevicesHaveNoUnauthorizedMenus() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    for (String gate : Arrays.asList("unresolved", "inactive", "permissions")) {
      data = market();
      if ("unresolved".equals(gate)) data.permissionsResolved = false;
      if ("inactive".equals(gate)) data.deviceActive = false;
      if ("permissions".equals(gate)) { data.permissions.clear(); data.deviceRole = "staff"; }
      assertEquals(Arrays.asList("today"), routes(AndroidUiRules.rootNavigation(data)));
      assertFalse(nav.open(data, "today:shipments")); assertFalse(nav.open(data, "customers"));
    }
  }

  @Test public void moreChildrenBackToMoreAndRootBackReturnsToday() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    nav.open(data, "more"); nav.open(data, "cash");
    assertEquals("more", nav.selectedRoot(data)); assertTrue(nav.back(data)); assertEquals("more", nav.route());
    nav.open(data, "today:commerce"); assertTrue(nav.back(data)); assertEquals("more", nav.route());
    assertTrue(nav.back(data)); assertEquals("today", nav.route()); assertFalse(nav.back(data));
    nav.open(data, "market"); assertTrue(nav.back(data)); assertEquals("today", nav.route());
  }

  @Test public void tapsAndSwipesShareSelectionWithoutWrappingOrHiddenTargets() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    assertFalse(nav.swipe(data, 0)); assertFalse(nav.swipe(data, 2));
    assertFalse(nav.swipe(data, -1)); assertTrue(nav.swipe(data, 1)); assertEquals("customers", nav.route());
    assertTrue(nav.swipe(data, 1)); assertEquals("market", nav.route());
    assertTrue(nav.swipe(data, 1)); assertEquals("more", nav.route()); assertFalse(nav.swipe(data, 1));
    nav.open(data, "cash"); assertTrue(nav.swipe(data, -1)); assertEquals("market", nav.route());
    data.permissions.remove("customer.view");
    nav.open(data, "today"); assertTrue(nav.swipe(data, 1)); assertEquals("market", nav.route());
    nav.open(data, "settings"); assertFalse(nav.swipe(data, 1));
  }

  @Test public void settingsBackRestoresRouteAndRechecksItsPermission() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    nav.open(data, "today:commerce"); nav.toggleSettings(data); assertEquals("settings", nav.route());
    assertEquals("", nav.selectedRoot(data)); nav.toggleSettings(data); assertEquals("today:commerce", nav.route());
    nav.toggleSettings(data); data.permissions.remove("commerce_order.view"); nav.back(data); assertEquals("today", nav.route());
    nav.open(data, "market"); data.permissions.remove("market.summary.view"); data.permissions.remove("market.product.view");
    assertTrue(nav.normalize(data)); assertEquals("today", nav.route());
  }

  @Test public void directRoutesNormalizeToCanonicalDestinationAndRecheckSubmodeGates() {
    OperationData data = market(); AndroidNavigationState nav = new AndroidNavigationState();
    assertTrue(nav.open(data, " TODAY/COMMERCE ")); assertEquals("today:commerce", nav.route());
    assertEquals("more", nav.selectedRoot(data)); assertTrue(nav.open(data, "not-a-page")); assertEquals("today", nav.route());
    data.businessCapabilities.add("accommodation.rooms"); data.permissions.add("room.view");
    assertTrue(nav.open(data, "pension")); assertFalse(nav.open(data, "pension:folios")); assertEquals("today", nav.route());
  }
}
