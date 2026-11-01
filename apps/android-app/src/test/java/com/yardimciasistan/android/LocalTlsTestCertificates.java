package com.yardimciasistan.android;

import java.io.InputStream;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Base64;

/** Public S1 certificates only. Fixtures contain no private keys or production identity. */
final class LocalTlsTestCertificates {
  static X509Certificate certificate(String name) throws Exception {
    try (InputStream stream = LocalTlsTestCertificates.class.getResourceAsStream("/local-tls/" + name + ".pem")) {
      if (stream == null) throw new AssertionError("Missing certificate fixture");
      return (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(stream);
    }
  }

  static String pin(String name) {
    try {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(
          MessageDigest.getInstance("SHA-256").digest(certificate(name).getPublicKey().getEncoded()));
    } catch (Exception error) { throw new AssertionError(error); }
  }
}
