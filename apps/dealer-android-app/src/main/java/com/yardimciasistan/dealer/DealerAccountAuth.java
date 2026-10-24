package com.yardimciasistan.dealer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/** PKCE binds browser handoff to this installation's pending attempt; no provider token enters Android. */
final class DealerAccountAuth {
  static String verifier() {
    byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }
  static String challenge(String verifier) throws Exception {
    if (!verifier.matches("[A-Za-z0-9_-]{43,128}")) throw new IllegalArgumentException("Geçersiz giriş denemesi.");
    return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
  }
}
