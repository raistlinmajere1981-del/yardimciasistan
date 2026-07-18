package com.yardimciasistan.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;

import java.util.Locale;
import java.util.UUID;

final class DeviceIdentity {
  private static final String KEY_DEVICE_ID = "device_id";

  final String deviceId;
  final String deviceName;
  final String appVersion;

  private DeviceIdentity(String deviceId, String deviceName, String appVersion) {
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    this.appVersion = appVersion;
  }

  static synchronized DeviceIdentity loadOrCreate(Context context, SharedPreferences preferences) {
    String storedId = preferences.getString(KEY_DEVICE_ID, "");
    String deviceId = storedId == null ? "" : storedId.trim();
    if (deviceId.isEmpty()) {
      deviceId = "android-" + UUID.randomUUID().toString();
      if (!preferences.edit().putString(KEY_DEVICE_ID, deviceId).commit()) {
        throw new IllegalStateException("Telefon kimliği kalıcı olarak kaydedilemedi.");
      }
      String canonicalId = preferences.getString(KEY_DEVICE_ID, "");
      deviceId = canonicalId == null ? "" : canonicalId.trim();
      if (deviceId.isEmpty()) {
        throw new IllegalStateException("Telefon kimliği kalıcı kayıttan doğrulanamadı.");
      }
    }
    return new DeviceIdentity(deviceId, resolveDeviceName(), resolveAppVersion(context));
  }

  private static String resolveDeviceName() {
    String manufacturer = safe(Build.MANUFACTURER);
    String model = safe(Build.MODEL);
    if (model.toLowerCase(Locale.ROOT).startsWith(manufacturer.toLowerCase(Locale.ROOT))) {
      return model.isEmpty() ? "Android Telefon" : model;
    }
    String value = (manufacturer + " " + model).trim();
    return value.isEmpty() ? "Android Telefon" : value;
  }

  private static String resolveAppVersion(Context context) {
    try {
      PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
      return info.versionName == null ? "" : info.versionName.trim();
    } catch (Exception ignored) {
      return "";
    }
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }
}
