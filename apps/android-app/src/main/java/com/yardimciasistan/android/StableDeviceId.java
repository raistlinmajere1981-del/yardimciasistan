package com.yardimciasistan.android;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

final class StableDeviceId {
  private static final String BROKEN_LEGACY_ANDROID_ID = "9774d56d682e549c";

  private StableDeviceId() {}

  static String from(String packageName, String androidId) {
    String normalizedAndroidId = androidId == null ? "" : androidId.trim().toLowerCase(Locale.ROOT);
    if (normalizedAndroidId.isEmpty() || BROKEN_LEGACY_ANDROID_ID.equals(normalizedAndroidId)) {
      return "";
    }
    String normalizedPackageName = packageName == null ? "" : packageName.trim();
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] bytes = digest.digest(("yardimci-asistan/android-device/v1\n"
          + normalizedPackageName + "\n" + normalizedAndroidId).getBytes(StandardCharsets.UTF_8));
      StringBuilder hex = new StringBuilder(bytes.length * 2);
      for (byte value : bytes) {
        hex.append(String.format(Locale.ROOT, "%02x", value & 0xff));
      }
      return "android-device-" + hex.substring(0, 32);
    } catch (Exception ignored) {
      return "";
    }
  }
}
