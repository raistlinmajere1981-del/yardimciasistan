package com.yardimciasistan.android;

public final class AndroidOperationsTransportSmoke {
  private AndroidOperationsTransportSmoke() {}

  public static void main(String[] args) {
    AndroidOperationsTransport.TransportException disabled =
        new AndroidOperationsTransport.TransportException(
            "Android kapalı.",
            "android_capability_disabled",
            403,
            null
        );
    require(disabled.disablesAndroidService(), "Capability-disabled error must disable Android service.");
    require(disabled.invalidatesPendingAction(), "Capability-disabled error must invalidate pending actions.");

    AndroidOperationsTransport.TransportException permissionDenied =
        new AndroidOperationsTransport.TransportException(
            "Yetki yok.",
            "android_action_permission_denied",
            403,
            null
        );
    require(!permissionDenied.disablesAndroidService(), "Permission error must not disable Android service.");
    require(permissionDenied.invalidatesPendingAction(), "Permission error must invalidate the rejected action.");

    AndroidOperationsTransport.TransportException offline =
        new AndroidOperationsTransport.TransportException("Bağlantı kurulamadı.");
    require(!offline.disablesAndroidService(), "Connection errors must not disable Android service.");
    require(!offline.invalidatesPendingAction(), "Connection errors must leave pending actions replayable.");
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new IllegalStateException(message);
    }
  }
}
