package com.yardimciasistan.android;

final class CompanionConnectionIdentity {
  private static final String HOSTING_SYNC_SUFFIX = "/api/sync.php";

  private CompanionConnectionIdentity() {}

  static String hostingSourceKey(String baseUrl) {
    String normalized = normalizedHostingBaseUrl(baseUrl);
    return normalized.isEmpty() ? "" : "hosting:" + normalized;
  }

  static String localSourceKey(String desktopId) {
    String normalized = desktopId == null ? "" : desktopId.trim();
    return normalized.isEmpty() ? "" : "local:" + normalized;
  }

  /**
   * Logical Android action target. It deliberately does not contain a transport
   * name or credential, so a queued action can later be delivered through the
   * paired local transport or the hosting fallback.
   */
  static String actionTargetKey(String hostingBaseUrl) {
    String normalized = normalizedHostingBaseUrl(hostingBaseUrl);
    return normalized.isEmpty() ? "" : "companion:" + normalized;
  }

  static String localActionTargetKey(String desktopId) {
    String normalized = desktopId == null ? "" : desktopId.trim();
    return normalized.matches("desktop-[A-Za-z0-9._:-]{8,120}") ? "companion:local:" + normalized : "";
  }

  static String actionTargetKey(android.content.SharedPreferences preferences, String hostingBaseUrl) {
    return ConnectionSettings.isLocalOnly(preferences)
        ? localActionTargetKey(ConnectionSettings.localConnection(preferences).desktopId)
        : actionTargetKey(hostingBaseUrl);
  }

  private static String normalizedHostingBaseUrl(String value) {
    String endpoint = HostingSyncClient.toSyncEndpoint(value == null ? "" : value.trim());
    if (!endpoint.endsWith(HOSTING_SYNC_SUFFIX)) {
      return "";
    }
    return endpoint.substring(0, endpoint.length() - HOSTING_SYNC_SUFFIX.length());
  }
}
