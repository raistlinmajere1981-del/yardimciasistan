package com.yardimciasistan.android;

import java.net.URI;
import java.util.TreeSet;
import java.util.regex.Pattern;

/** Device-local voice gates; provider/model credentials never belong here. */
final class AndroidVoiceRules {
  static final long MAX_AUDIO_BYTES = 5L * 1024 * 1024;
  static final int MAX_DURATION_MS = 120_000;
  static final int MAX_TEXT_CHARS = 16_000;
  private static final Pattern SECRET_TEXT = Pattern.compile(
      "(?i)(yat_[a-f0-9]{64}|yab1\\.|\\bsk-[a-z0-9_-]{12,}|\\bAIza[a-z0-9_-]{20,}"
      + "|bearer\\s+\\S+|(?:api[_ -]?key|sync[_ -]?secret|device[_ -]?token|password|parola|şifre)\\s*[:=])");

  static boolean httpsHosting(String value) {
    try {
      URI uri = new URI(value == null ? "" : value.trim());
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
          && uri.getUserInfo() == null && uri.getQuery() == null && uri.getFragment() == null;
    } catch (Exception ignored) { return false; }
  }

  static boolean canDictate(OperationData data, boolean freshAuthority, boolean online,
      String hostingUrl, String credential) {
    return data != null && data.sttAvailable && data.hasPermission("voice.dictation")
        && freshAuthority && online && httpsHosting(hostingUrl)
        && ConnectionSettings.isDeviceCredential(credential);
  }

  /**
   * Only authorization changes should invalidate an in-progress recording.
   * Ordinary snapshot timestamps/server revisions move on every sync.
   * This fingerprint never enters persistent storage or application logs.
   */
  static String authorityIdentity(OperationData data, String deviceId, String hostingUrl, String credential) {
    return deviceId + "\n" + hostingUrl + "\n" + credential
        + "\n" + data.deviceRole + "\n" + data.deviceActive
        + "\n" + data.permissionsResolved + "\n" + new TreeSet<>(data.permissions)
        + "\n" + data.capabilitiesResolved + "\n" + new TreeSet<>(data.businessCapabilities)
        + "\n" + data.sttAvailable;
  }

  static boolean ttsEnabled(Boolean saved, boolean engineAvailable) {
    return engineAvailable && (saved == null || saved);
  }

  static boolean readableText(String text) {
    return text != null && !text.trim().isEmpty() && text.length() <= 4000
        && !SECRET_TEXT.matcher(text).find();
  }

  private AndroidVoiceRules() {}
}
