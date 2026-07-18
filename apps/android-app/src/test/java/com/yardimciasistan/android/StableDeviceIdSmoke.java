package com.yardimciasistan.android;

public final class StableDeviceIdSmoke {
  private StableDeviceIdSmoke() {}

  public static void main(String[] args) {
    String first = StableDeviceId.from("com.yardimciasistan.android", "0123456789ABCDEF");
    String repeated = StableDeviceId.from("com.yardimciasistan.android", " 0123456789abcdef ");
    String otherDevice = StableDeviceId.from("com.yardimciasistan.android", "fedcba9876543210");

    require(first.equals(repeated), "Aynı Android kimliği aynı cihaz kimliğini üretmedi.");
    require(!first.equals(otherDevice), "Farklı Android kimlikleri aynı cihaz kimliğini üretti.");
    require(first.matches("android-device-[a-f0-9]{32}"), "Kararlı cihaz kimliği beklenen biçimde değil.");
    require(StableDeviceId.from("com.yardimciasistan.android", "").isEmpty(), "Boş Android kimliği kabul edildi.");
    require(StableDeviceId.from("com.yardimciasistan.android", "9774d56d682e549c").isEmpty(), "Bilinen bozuk Android kimliği kabul edildi.");

    System.out.println("android-stable-device-id-smoke-ok");
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new IllegalStateException(message);
    }
  }
}
