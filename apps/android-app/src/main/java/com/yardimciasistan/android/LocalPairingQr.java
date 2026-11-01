package com.yardimciasistan.android;

/** Version 3 only: trust originates in the Desktop's QR, never discovery or /status. */
final class LocalPairingQr {
  final String desktopId;
  final String credential;
  final String baseUrl;
  final String spkiSha256;

  private LocalPairingQr(String desktopId, String credential, String baseUrl, String pin) {
    this.desktopId = desktopId;
    this.credential = credential;
    this.baseUrl = baseUrl;
    this.spkiSha256 = pin;
  }

  static LocalPairingQr parse(String value) throws LocalCompanionPairingClient.PairingException {
    String raw = value == null ? "" : value;
    String[] fields = raw.split("\\|", -1);
    if (raw.length() > 271 || fields.length != 5 || !"yapair3".equals(fields[0])
        || !fields[1].matches("desktop-[A-Za-z0-9._:-]{8,120}")
        || LocalPinnedHttps.decodePin(fields[2]) == null || LocalPinnedHttps.decodePin(fields[4]) == null) throw invalid();
    String endpoint = LocalPinnedHttps.normalizeAuthority(fields[3]);
    if (endpoint.isEmpty()) throw invalid();
    byte[] secret = LocalPinnedHttps.decodePin(fields[2]);
    StringBuilder hex = new StringBuilder(64);
    for (byte b : secret) {
      hex.append(Character.forDigit((b >>> 4) & 0xf, 16));
      hex.append(Character.forDigit(b & 0xf, 16));
    }
    return new LocalPairingQr(fields[1], "yald1." + hex, endpoint, fields[4]);
  }

  private static LocalCompanionPairingClient.PairingException invalid() {
    return new LocalCompanionPairingClient.PairingException(
        "Güvenli masaüstü QR kodu gerekli. Masaüstünde yeni bir eşleştirme QR kodu açın.", "local_qr_invalid");
  }
}
