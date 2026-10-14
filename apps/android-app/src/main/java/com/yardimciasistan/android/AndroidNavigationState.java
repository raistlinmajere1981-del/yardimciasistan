package com.yardimciasistan.android;

import java.util.List;
import java.util.Locale;

/** One route owner for menu taps, launch routes, Back and root swipes; no domain state lives here. */
final class AndroidNavigationState {
  private String route = AndroidUiRules.TAB_TODAY;
  private String settingsReturnRoute = AndroidUiRules.TAB_TODAY;

  String route() { return route; }
  String settingsReturnRoute() { return settingsReturnRoute; }
  String tab() { return AndroidUiRules.resolveDestination(route).tab; }
  boolean settingsOpen() { return "settings".equals(route); }

  boolean open(OperationData data, String requested) {
    String normalized = requested == null ? "today" : requested.trim().toLowerCase(Locale.ROOT).replace('/', ':').replace('#', ':');
    if (!"settings".equals(normalized)) {
      AndroidUiRules.Destination destination = AndroidUiRules.resolveDestination(normalized);
      normalized = destination.tab + (normalized.contains(":") && !destination.mode.isEmpty() ? ":" + destination.mode : "");
    }
    if (!AndroidUiRules.canOpenRoute(data, normalized)) {
      route = AndroidUiRules.TAB_TODAY;
      return false;
    }
    if ("settings".equals(normalized) && !settingsOpen()) settingsReturnRoute = route;
    route = normalized;
    return true;
  }

  void toggleSettings(OperationData data) {
    open(data, settingsOpen() ? settingsReturnRoute : "settings");
  }

  boolean normalize(OperationData data) {
    if (AndroidUiRules.canOpenRoute(data, route)) return false;
    route = AndroidUiRules.TAB_TODAY;
    return true;
  }

  String selectedRoot(OperationData data) {
    if (settingsOpen()) return "";
    for (AndroidUiRules.NavigationItem item : AndroidUiRules.rootNavigation(data)) {
      if (item.route.equals(tab()) && (!AndroidUiRules.TAB_TODAY.equals(tab())
          || AndroidUiRules.resolveDestination(route).mode.isEmpty())) return item.route;
    }
    return AndroidUiRules.TAB_MORE;
  }

  boolean swipe(OperationData data, int direction) {
    if (settingsOpen() || Math.abs(direction) != 1) return false;
    List<AndroidUiRules.NavigationItem> roots = AndroidUiRules.rootNavigation(data);
    String selected = selectedRoot(data);
    for (int i = 0; i < roots.size(); i++) {
      int next = i + direction;
      if (roots.get(i).route.equals(selected) && next >= 0 && next < roots.size()) {
        return open(data, roots.get(next).route);
      }
    }
    return false;
  }

  boolean back(OperationData data) {
    if (settingsOpen()) { open(data, settingsReturnRoute); return true; }
    if (AndroidUiRules.TAB_MORE.equals(selectedRoot(data)) && !AndroidUiRules.TAB_MORE.equals(route)) {
      open(data, AndroidUiRules.TAB_MORE); return true;
    }
    if (!AndroidUiRules.TAB_TODAY.equals(route)) { open(data, AndroidUiRules.TAB_TODAY); return true; }
    return false;
  }
}
